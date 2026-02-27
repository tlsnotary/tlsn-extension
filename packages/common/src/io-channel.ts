/**
 * IoChannel interface for bidirectional byte streams.
 *
 * This interface is used by the WASM SDK to communicate with external services.
 * Implement this interface to provide custom IO streams (WebSocket, TCP, etc.).
 */
export interface IoChannel {
  /**
   * Reads bytes from the stream.
   * @returns A promise that resolves to the bytes read, or null if EOF.
   */
  read(): Promise<Uint8Array | null>;

  /**
   * Writes bytes to the stream.
   * @param data The bytes to write.
   * @returns A promise that resolves when the write is complete.
   */
  write(data: Uint8Array): Promise<void>;

  /**
   * Closes the stream.
   * @returns A promise that resolves when the stream is closed.
   */
  close(): Promise<void>;
}

/**
 * Creates a IoChannel adapter from a WebSocket.
 *
 * @param url The WebSocket URL to connect to.
 * @returns A promise that resolves to a IoChannel when the connection is open.
 *
 * @example
 * ```typescript
 * const io = await fromWebSocket('wss://verifier.example.com');
 * await prover.setup(io);
 * ```
 */
/** Maximum total bytes queued before the socket is closed (10 MB). */
const MAX_READ_QUEUE_BYTES = 10 * 1024 * 1024;

export async function fromWebSocket(url: string): Promise<IoChannel> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    const readQueue: Uint8Array[] = [];
    let readQueueBytes = 0;
    let readResolver: ((value: Uint8Array | null) => void) | null = null;
    let closed = false;
    let error: Error | null = null;

    ws.onopen = () => {
      resolve(
        new WebSocketIoChannel(
          ws,
          readQueue,
          () => readResolver,
          (r) => {
            readResolver = r;
          },
          () => closed,
          (c) => {
            closed = c;
          },
          () => error,
          (e) => {
            error = e;
          },
        ),
      );
    };

    ws.onerror = (event) => {
      const err = new Error(`WebSocket connection failed: ${event.type}`);
      if (!closed) {
        error = err;
        closed = true;
        ws.close();
        reject(err);
      }
    };

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      if (readResolver) {
        const resolver = readResolver;
        readResolver = null;
        resolver(data);
      } else {
        readQueueBytes += data.byteLength;
        if (readQueueBytes > MAX_READ_QUEUE_BYTES) {
          error = new Error(`Read queue exceeded ${MAX_READ_QUEUE_BYTES} bytes — closing socket`);
          closed = true;
          ws.close(1009, 'Read queue overflow');
          return;
        }
        readQueue.push(data);
      }
    };

    ws.onclose = () => {
      closed = true;
      if (readResolver) {
        const resolver = readResolver;
        readResolver = null;
        resolver(null);
      }
    };
  });
}

/**
 * Creates a IoChannel adapter from an already-open WebSocket.
 *
 * @param ws The WebSocket instance (must be in OPEN state).
 * @returns A IoChannel adapter.
 *
 * @example
 * ```typescript
 * const ws = new WebSocket('wss://verifier.example.com');
 * await new Promise(resolve => ws.onopen = resolve);
 * const io = fromOpenWebSocket(ws);
 * await prover.setup(io);
 * ```
 */
export function fromOpenWebSocket(ws: WebSocket): IoChannel {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket is not open');
  }

  ws.binaryType = 'arraybuffer';

  const readQueue: Uint8Array[] = [];
  let readQueueBytes = 0;
  let readResolver: ((value: Uint8Array | null) => void) | null = null;
  let closed = false;
  let error: Error | null = null;

  ws.onmessage = (event) => {
    const data = new Uint8Array(event.data as ArrayBuffer);
    if (readResolver) {
      const resolver = readResolver;
      readResolver = null;
      resolver(data);
    } else {
      readQueueBytes += data.byteLength;
      if (readQueueBytes > MAX_READ_QUEUE_BYTES) {
        error = new Error(`Read queue exceeded ${MAX_READ_QUEUE_BYTES} bytes — closing socket`);
        closed = true;
        ws.close(1009, 'Read queue overflow');
        return;
      }
      readQueue.push(data);
    }
  };

  ws.onclose = () => {
    closed = true;
    if (readResolver) {
      const resolver = readResolver;
      readResolver = null;
      resolver(null);
    }
  };

  ws.onerror = () => {
    error = new Error('WebSocket error');
    closed = true;
    if (readResolver) {
      const resolver = readResolver;
      readResolver = null;
      resolver(null);
    }
  };

  return new WebSocketIoChannel(
    ws,
    readQueue,
    () => readResolver,
    (r) => {
      readResolver = r;
    },
    () => closed,
    (c) => {
      closed = c;
    },
    () => error,
    (e) => {
      error = e;
    },
  );
}

class WebSocketIoChannel implements IoChannel {
  constructor(
    private ws: WebSocket,
    private readQueue: Uint8Array[],
    private getReadResolver: () => ((value: Uint8Array | null) => void) | null,
    private setReadResolver: (r: ((value: Uint8Array | null) => void) | null) => void,
    private isClosed: () => boolean,
    private setClosed: (c: boolean) => void,
    private getError: () => Error | null,
    private setError: (e: Error | null) => void,
  ) {}

  async read(): Promise<Uint8Array | null> {
    // Check for error.
    const error = this.getError();
    if (error) {
      throw error;
    }

    // Return queued data if available.
    if (this.readQueue.length > 0) {
      return this.readQueue.shift()!;
    }

    // Return null if closed.
    if (this.isClosed()) {
      return null;
    }

    // Wait for data.
    return new Promise((resolve) => {
      this.setReadResolver(resolve);
    });
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.isClosed()) {
      throw new Error('WebSocket is closed');
    }

    const error = this.getError();
    if (error) {
      throw error;
    }

    this.ws.send(data);
  }

  async close(): Promise<void> {
    if (!this.isClosed()) {
      this.setClosed(true);
      this.ws.close();
    }
  }
}
