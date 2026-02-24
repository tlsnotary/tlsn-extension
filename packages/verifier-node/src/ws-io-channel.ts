/**
 * IoChannel adapter for Node.js WebSocket (ws library).
 *
 * Implements the IoChannel interface expected by the WASM Verifier:
 *   read():  Promise<Uint8Array | null>  (null = EOF)
 *   write(data: Uint8Array): Promise<void>
 *   close(): Promise<void>
 *
 * Pattern mirrors the browser implementation in
 * packages/extension/src/offscreen/ProveManager/worker.ts
 */

import type WebSocket from 'ws';

export interface IoChannel {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/**
 * Wraps an already-connected ws WebSocket as an IoChannel.
 */
export function createIoChannel(ws: WebSocket): IoChannel {
  const readQueue: Uint8Array[] = [];
  let readResolver: ((value: Uint8Array | null) => void) | null = null;
  let closed = false;
  let error: Error | null = null;

  ws.binaryType = 'nodebuffer';

  ws.on('message', (data: Buffer) => {
    const bytes = new Uint8Array(data);
    if (readResolver) {
      const resolver = readResolver;
      readResolver = null;
      resolver(bytes);
    } else {
      readQueue.push(bytes);
    }
  });

  ws.on('close', () => {
    closed = true;
    if (readResolver) {
      const resolver = readResolver;
      readResolver = null;
      resolver(null);
    }
  });

  ws.on('error', (err) => {
    error = err instanceof Error ? err : new Error(String(err));
    closed = true;
    if (readResolver) {
      const resolver = readResolver;
      readResolver = null;
      resolver(null);
    }
  });

  return {
    async read(): Promise<Uint8Array | null> {
      if (error) throw error;
      if (readQueue.length > 0) return readQueue.shift()!;
      if (closed) return null;
      return new Promise((resolve) => {
        readResolver = resolve;
      });
    },
    async write(data: Uint8Array): Promise<void> {
      if (closed) throw new Error('WebSocket is closed');
      if (error) throw error;
      ws.send(data);
    },
    async close(): Promise<void> {
      if (!closed) {
        closed = true;
        ws.close();
      }
    },
  };
}
