/**
 * Browser integration test: real MPC-TLS prove using the tlsn WASM prover.
 *
 * This test mirrors packages/verifier/src/tests/integration_test.rs but runs
 * the WASM prover inside Chromium via Playwright. It connects to a real
 * verifier server (auto-started by globalSetup.ts) and performs MPC-TLS
 * against raw.githubusercontent.com through the /proxy endpoint.
 *
 * The WASM operations run inside a dedicated Web Worker (prove-worker.js)
 * because the rayon thread pool uses Atomics.wait() which is blocked on
 * the browser main thread.
 */
import { describe, it, expect } from 'vitest';

// ============================================================================
// Configuration
// ============================================================================

const VERIFIER_PORT = 17147;
const MAX_SENT_DATA = 4096;
const MAX_RECV_DATA = 16384;
const SERVER_NAME = 'raw.githubusercontent.com';
const REQUEST_PATH =
  '/tlsnotary/tlsn/refs/heads/main/crates/server-fixture/server/src/data/4kb.json';

// ============================================================================
// Worker communication helper
// ============================================================================

interface ProveResult {
  sessionId: string;
  sentLength: number;
  recvLength: number;
  resultsLength: number;
  recvStr: string;
}

function runProveInWorker(config: {
  verifierPort: number;
  serverName: string;
  requestPath: string;
  maxSentData: number;
  maxRecvData: number;
  threads: number;
}): Promise<ProveResult> {
  return new Promise((resolve, reject) => {
    // Load the Worker from our raw middleware URL (no Vite transforms)
    const worker = new Worker('/@test/prove-worker.js', { type: 'module' });

    worker.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === 'log') {
        const prefix = `[Worker/${msg.level}]`;
        if (msg.level === 'error') {
          console.error(prefix, msg.message);
        } else {
          console.log(prefix, msg.message);
        }
        return;
      }

      if (msg.type === 'result') {
        worker.terminate();
        if (msg.success) {
          resolve(msg.data);
        } else {
          reject(new Error(msg.error));
        }
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`Worker error: ${event.message}`));
    };

    // Start the prove flow
    worker.postMessage({ type: 'run', config });
  });
}

// ============================================================================
// Test
// ============================================================================

describe('WASM Prove Integration', () => {
  it(
    'should perform MPC-TLS prove against raw.githubusercontent.com',
    async () => {
      console.log('[Test] Starting MPC-TLS prove via Worker...');
      console.log('[Test] crossOriginIsolated:', self.crossOriginIsolated);

      const result = await runProveInWorker({
        verifierPort: VERIFIER_PORT,
        serverName: SERVER_NAME,
        requestPath: REQUEST_PATH,
        maxSentData: MAX_SENT_DATA,
        maxRecvData: MAX_RECV_DATA,
        threads: Math.min(navigator.hardwareConcurrency || 4, 4),
      });

      console.log('[Test] Prove completed successfully');

      // Assertions (same as Rust integration test)
      expect(result.sessionId).toBeTruthy();
      expect(result.sentLength).toBeGreaterThan(0);
      expect(result.recvLength).toBeGreaterThan(0);
      expect(result.resultsLength).toBeGreaterThan(0);
      expect(
        result.recvStr.includes('software engineer') ||
          result.recvStr.includes('Anytown'),
      ).toBe(true);

      console.log('[Test] All assertions passed');
    },
    180_000,
  );
});
