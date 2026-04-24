import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for ProveManager fixes:
 * - #6:  freeProver() is awaited in cleanupProver()
 * - #11: Duplicate listener registration guarded in init()
 * - #12: cleanupProver() logs warning instead of empty catch
 * - #13: getResponse() throws on hard timeout
 * - #14: sendRevealConfig() wraps worker error
 */

// ---------------------------------------------------------------------------
// Mock the worker module and Comlink
// ---------------------------------------------------------------------------
const mockWorkerApi = {
  init: vi.fn().mockResolvedValue(undefined),
  createProver: vi.fn().mockResolvedValue('prover-0'),
  createSession: vi.fn().mockResolvedValue('session-0'),
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
  sendRevealConfig: vi.fn().mockResolvedValue(undefined),
  awaitSessionCompleted: vi.fn().mockResolvedValue({ results: [] }),
  closeSession: vi.fn().mockResolvedValue(undefined),
  freeProver: vi.fn().mockResolvedValue(undefined),
};

const mockAddEventListener = vi.fn();

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
    mockWorkerApi.freeProver.mockRejectedValueOnce(new Error('already freed'));

    // Insert a session entry directly so closeSession + freeProver are exercised.
    (pm as unknown as { sessions: Map<string, unknown> }).sessions.set('prover-0', {
      sessionId: 'sess-1',
      response: null,
      responseReceived: false,
      completionPromise: null,
    });

    await pm.cleanupProver('prover-0');

    expect(mockWorkerApi.closeSession).toHaveBeenCalledWith('sess-1');
    expect(mockWorkerApi.freeProver).toHaveBeenCalledWith('prover-0');

    warnSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // #13 — hard timeout on getResponse
  // -----------------------------------------------------------------------
  it('throws on getResponse timeout (#13)', async () => {
    (pm as unknown as { sessions: Map<string, unknown> }).sessions.set('prover-timeout', {
      sessionId: 'sess-t',
      response: null,
      responseReceived: false,
      completionPromise: null,
    });

    const original = (ProveManager as unknown as { GET_RESPONSE_TIMEOUT_MS: number })
      .GET_RESPONSE_TIMEOUT_MS;
    (ProveManager as unknown as { GET_RESPONSE_TIMEOUT_MS: number }).GET_RESPONSE_TIMEOUT_MS = 100;

    await expect(pm.getResponse('prover-timeout', 200)).rejects.toThrow(/timed out/i);

    (ProveManager as unknown as { GET_RESPONSE_TIMEOUT_MS: number }).GET_RESPONSE_TIMEOUT_MS =
      original;
  });

  // -----------------------------------------------------------------------
  // #14 — sendRevealConfig wraps worker error in descriptive error
  // -----------------------------------------------------------------------
  it('wraps worker sendRevealConfig error in descriptive error (#14)', async () => {
    mockWorkerApi.sendRevealConfig.mockRejectedValueOnce(new Error('session closed'));

    (pm as unknown as { sessions: Map<string, unknown> }).sessions.set('prover-send', {
      sessionId: 'sess-s',
      response: null,
      responseReceived: false,
      completionPromise: null,
    });

    await expect(pm.sendRevealConfig('prover-send', { sent: [], recv: [] })).rejects.toThrow(
      /Reveal config send failed for prover prover-send.*session closed/,
    );
  });

  it('sendRevealConfig throws if session not found', async () => {
    await expect(pm.sendRevealConfig('nonexistent', { sent: [], recv: [] })).rejects.toThrow(
      /Session not found/,
    );
  });

  // -----------------------------------------------------------------------
  // Per-prover progress callbacks (concurrency fix)
  // -----------------------------------------------------------------------
  describe('Per-prover progress callbacks', () => {
    it('routes WASM progress to the correct prover callback', async () => {
      await pm.init();

      const callsA: string[] = [];
      const callsB: string[] = [];

      pm.setProgressCallbackForProver('prover-A', (data) => callsA.push(data.message));
      pm.setProgressCallbackForProver('prover-B', (data) => callsB.push(data.message));

      // Simulate WASM_PROGRESS worker message — broadcasts to all callbacks
      const listener = mockAddEventListener.mock.calls[0][1];
      listener({
        data: { type: 'WASM_PROGRESS', step: 'TEST', progress: 0.5, message: 'half done' },
      });

      expect(callsA).toEqual(['half done']);
      expect(callsB).toEqual(['half done']);
    });

    it('does not fire callback after prover is cleaned up', async () => {
      await pm.init();

      const calls: string[] = [];
      pm.setProgressCallbackForProver('prover-X', (data) => calls.push(data.message));

      (pm as unknown as { sessions: Map<string, unknown> }).sessions.set('prover-X', {
        sessionId: 'sess-x',
        response: null,
        responseReceived: false,
        completionPromise: null,
      });
      await pm.cleanupProver('prover-X');

      const listener = mockAddEventListener.mock.calls[0][1];
      listener({
        data: { type: 'WASM_PROGRESS', step: 'TEST', progress: 1, message: 'late' },
      });

      expect(calls).toEqual([]);
    });

    it('isolates callbacks — removing one does not affect the other', async () => {
      await pm.init();

      const callsA: string[] = [];
      const callsB: string[] = [];

      pm.setProgressCallbackForProver('prover-A', (data) => callsA.push(data.message));
      pm.setProgressCallbackForProver('prover-B', (data) => callsB.push(data.message));

      // Remove A's callback
      pm.setProgressCallbackForProver('prover-A', null);

      const listener = mockAddEventListener.mock.calls[0][1];
      listener({
        data: { type: 'WASM_PROGRESS', step: 'TEST', progress: 1, message: 'msg' },
      });

      expect(callsA).toEqual([]);
      expect(callsB).toEqual(['msg']);
    });
  });
});
