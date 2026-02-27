import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for IoChannel (fromWebSocket / fromOpenWebSocket).
 *
 * These tests use a minimal WebSocket mock to verify:
 * - #2: WebSocket is closed on error before connection opens
 * - #7: Read queue overflow closes the socket with code 1009
 */

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  binaryType = 'blob';
  readyState = MockWebSocket.CONNECTING;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onopen: ((ev: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((ev: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessage: ((ev: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onclose: ((ev: any) => void) | null = null;

  close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
    queueMicrotask(() => this.onclose?.({ code: _code, reason: _reason }));
  });

  send = vi.fn();

  _simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  _simulateError() {
    this.onerror?.({ type: 'error' });
  }

  _simulateMessage(data: ArrayBuffer) {
    this.onmessage?.({ data });
  }
}

beforeEach(() => {
  // @ts-expect-error mock
  globalThis.WebSocket = MockWebSocket;
});

// Import after mock is set up (dynamic import to use the mock)
const { fromWebSocket, fromOpenWebSocket } = await import('./io-channel');

describe('fromWebSocket', () => {
  it('closes WebSocket on connection error (#2)', async () => {
    let capturedWs: MockWebSocket | null = null;

    // @ts-expect-error mock
    globalThis.WebSocket = class extends MockWebSocket {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_url: string) {
        super();
        capturedWs = this; // eslint-disable-line @typescript-eslint/no-this-alias
      }
    };

    const ioPromise = fromWebSocket('wss://bad.example.com');
    expect(capturedWs).not.toBeNull();

    // Simulate error before open
    capturedWs!._simulateError();

    await expect(ioPromise).rejects.toThrow('WebSocket connection failed');
    expect(capturedWs!.close).toHaveBeenCalled();
  });

  it('enforces read queue size limit (#7)', async () => {
    let capturedWs: MockWebSocket | null = null;

    // @ts-expect-error mock
    globalThis.WebSocket = class extends MockWebSocket {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_url: string) {
        super();
        capturedWs = this; // eslint-disable-line @typescript-eslint/no-this-alias
      }
    };

    const ioPromise = fromWebSocket('wss://example.com');
    capturedWs!._simulateOpen();
    const io = await ioPromise;

    // Push messages without reading — exceed 10 MB limit
    const bigChunk = new ArrayBuffer(1024 * 1024); // 1 MB
    for (let i = 0; i < 11; i++) {
      capturedWs!._simulateMessage(bigChunk);
    }

    // Socket should have been closed with code 1009
    expect(capturedWs!.close).toHaveBeenCalledWith(1009, 'Read queue overflow');

    // Subsequent read should throw
    await expect(io.read()).rejects.toThrow('Read queue exceeded');
  });
});

describe('fromOpenWebSocket', () => {
  it('throws if WebSocket is not open', () => {
    const ws = new MockWebSocket();
    ws.readyState = MockWebSocket.CLOSED;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => fromOpenWebSocket(ws as any)).toThrow('WebSocket is not open');
  });

  it('enforces read queue size limit (#7)', async () => {
    const ws = new MockWebSocket();
    ws.readyState = MockWebSocket.OPEN;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const io = fromOpenWebSocket(ws as any);

    // Push messages without reading — exceed 10 MB limit
    const bigChunk = new ArrayBuffer(1024 * 1024); // 1 MB
    for (let i = 0; i < 11; i++) {
      ws._simulateMessage(bigChunk);
    }

    expect(ws.close).toHaveBeenCalledWith(1009, 'Read queue overflow');
    await expect(io.read()).rejects.toThrow('Read queue exceeded');
  });
});
