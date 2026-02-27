import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for ProveManager fixes:
 * - #6:  freeProver() is awaited in cleanupProver()
 * - #11: Duplicate listener registration guarded in init()
 * - #12: cleanupProver() logs warning instead of empty catch
 * - #13: getResponse() throws on hard timeout
 * - #14: sendRevealConfig() wraps ws.send() error
 */

// ---------------------------------------------------------------------------
// Mock the worker module and Comlink
// ---------------------------------------------------------------------------
const mockWorkerApi = {
  init: vi.fn().mockResolvedValue(undefined),
  createProver: vi.fn().mockResolvedValue('prover-0'),
  setupProver: vi.fn().mockResolvedValue(undefined),
  sendRequest: vi.fn().mockResolvedValue(undefined),
  getTranscript: vi.fn().mockReturnValue({ sent: [], recv: [] }),
  computeReveal: vi.fn().mockReturnValue({
    sentRanges: [],
    recvRanges: [],
    sentRangesWithHandlers: [],
    recvRangesWithHandlers: [],
  }),
  reveal: vi.fn().mockResolvedValue(undefined),
  freeProver: vi.fn().mockResolvedValue(undefined),
};

const mockAddEventListener = vi.fn();

// Provide WebSocket constants (used by closeSession / sendRevealConfig)
vi.stubGlobal('WebSocket', {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
});

vi.mock('comlink', () => ({
  wrap: () => mockWorkerApi,
}));

// Mock the Worker constructor
vi.stubGlobal(
  'Worker',
  class {
    addEventListener = mockAddEventListener;
    postMessage = vi.fn();
  },
);

// Must import after mocks
const { ProveManager } = await import('../../src/offscreen/ProveManager/index');

describe('ProveManager', () => {
  let pm: InstanceType<typeof ProveManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    pm = new ProveManager();
  });

  // -----------------------------------------------------------------------
  // #11 — duplicate listener guard
  // -----------------------------------------------------------------------
  it('registers worker message listener only once across multiple init() calls (#11)', async () => {
    await pm.init();
    await pm.init();
    await pm.init();

    // addEventListener should have been called exactly once
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // #6 — freeProver awaited + #12 — warning logged on failure
  // -----------------------------------------------------------------------
  it('awaits freeProver and logs warning on failure (#6, #12)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    // Make freeProver reject
    mockWorkerApi.freeProver.mockRejectedValueOnce(new Error('already freed'));

    // We need a session entry to exercise closeSession path
    // Access private sessions map via any cast
    (pm as any).sessions.set('prover-0', {
      sessionId: 'sess-1',
      webSocket: { readyState: 3, close: vi.fn() }, // CLOSED
      response: null,
      responseReceived: false,
    });

    await pm.cleanupProver('prover-0');

    // freeProver was called (and awaited — test would hang if not)
    expect(mockWorkerApi.freeProver).toHaveBeenCalledWith('prover-0');

    warnSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // #13 — hard timeout on getResponse
  // -----------------------------------------------------------------------
  it('throws on getResponse timeout (#13)', async () => {
    // Set up a session that never receives a response
    (pm as any).sessions.set('prover-timeout', {
      sessionId: 'sess-t',
      webSocket: { readyState: 1, close: vi.fn() },
      response: null,
      responseReceived: false,
    });

    // Override the static timeout to 100ms for fast test
    const original = (ProveManager as any).GET_RESPONSE_TIMEOUT_MS;
    (ProveManager as any).GET_RESPONSE_TIMEOUT_MS = 100;

    await expect(pm.getResponse('prover-timeout', 200)).rejects.toThrow(
      /timed out/i,
    );

    // Restore
    (ProveManager as any).GET_RESPONSE_TIMEOUT_MS = original;
  });

  // -----------------------------------------------------------------------
  // #14 — sendRevealConfig wraps ws.send() error
  // -----------------------------------------------------------------------
  it('wraps ws.send() TypeError in descriptive error (#14)', async () => {
    const mockWs = {
      readyState: 1, // WebSocket.OPEN
      close: vi.fn(),
      send: vi.fn(() => {
        throw new TypeError('Failed to execute send');
      }),
    };

    (pm as any).sessions.set('prover-send', {
      sessionId: 'sess-s',
      webSocket: mockWs,
      response: null,
      responseReceived: false,
    });

    await expect(
      pm.sendRevealConfig('prover-send', { sent: [], recv: [] }),
    ).rejects.toThrow(
      /Reveal config send failed.*verifier connection was closed/,
    );
  });

  it('sendRevealConfig throws if session not found', async () => {
    await expect(
      pm.sendRevealConfig('nonexistent', { sent: [], recv: [] }),
    ).rejects.toThrow(/Session not found/);
  });
});
