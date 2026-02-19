/**
 * Web Worker that runs the full MPC-TLS prove flow using the tlsn WASM prover.
 *
 * Uses IoChannel (from @tlsn/common) to inject WebSocket IO from JavaScript,
 * exercising the same code path as the extension. This is critical: without
 * the deadlock fix, WASM's Atomics.wait() blocks the thread and prevents
 * the WebSocket event loop from pumping data, causing a deadlock.
 *
 * Communication protocol:
 *   Main thread → Worker: { type: 'run', config: { ... } }
 *   Worker → Main thread: { type: 'log', level, message }
 *   Worker → Main thread: { type: 'result', success, data }
 */

import { fromWebSocket } from '/@tlsn-common/io-channel.js';

// ============================================================================
// SessionClient: WebSocket protocol for verifier /session endpoint
// ============================================================================

class SessionClient {
  constructor() {
    this.ws = null;
    this.sessionId = null;
  }

  async connect(verifierUrl) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${verifierUrl}/session`);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () =>
        reject(new Error(`Session WebSocket failed: ${verifierUrl}`));
    });
  }

  async register(maxRecvData, maxSentData, sessionData) {
    return new Promise((resolve, reject) => {
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'session_registered' && data.sessionId) {
          this.sessionId = data.sessionId;
          this.ws.removeEventListener('message', handler);
          resolve(data.sessionId);
        } else if (data.type === 'error') {
          this.ws.removeEventListener('message', handler);
          reject(new Error(`Server error: ${data.message}`));
        }
      };
      this.ws.addEventListener('message', handler);
      this.ws.send(
        JSON.stringify({
          type: 'register',
          maxRecvData,
          maxSentData,
          sessionData,
        }),
      );
    });
  }

  sendRevealConfig(sent, recv) {
    this.ws.send(JSON.stringify({ type: 'reveal_config', sent, recv }));
  }

  async waitForCompletion(timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws.removeEventListener('message', handler);
        reject(new Error('Timed out waiting for session_completed'));
      }, timeoutMs);

      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'session_completed' && data.results) {
          clearTimeout(timeout);
          this.ws.removeEventListener('message', handler);
          resolve(data.results);
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          this.ws.removeEventListener('message', handler);
          reject(new Error(`Server error: ${data.message}`));
        }
      };
      this.ws.addEventListener('message', handler);
    });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

// ============================================================================
// Logging helper
// ============================================================================

function log(level, message) {
  self.postMessage({ type: 'log', level, message });
}

// ============================================================================
// Main prove flow
// ============================================================================

async function runProve(config) {
  const {
    verifierPort,
    serverName,
    requestPath,
    maxSentData,
    maxRecvData,
    threads,
  } = config;

  const verifierBase = `ws://127.0.0.1:${verifierPort}`;

  // 1. Init WASM
  log('info', 'Loading WASM module...');
  const wasm = await import('/@tlsn-wasm/tlsn_wasm.js');
  await wasm.default();
  await wasm.initialize(null, threads);
  log('info', 'WASM initialized');

  // 2. Register session with verifier
  const session = new SessionClient();
  await session.connect(verifierBase);
  const sessionId = await session.register(maxRecvData, maxSentData, {
    test: 'browser-prove',
  });
  log('info', `Session registered: ${sessionId}`);

  // 3. Create prover
  const prover = new wasm.Prover({
    server_name: serverName,
    max_sent_data: maxSentData,
    max_recv_data: maxRecvData,
    network: 'Bandwidth',
  });

  // 4. Setup MPC protocol with verifier via IoChannel (NOT a URL string).
  //    This is the code path that deadlocks without the fix — WASM and the
  //    WebSocket share this thread, so Atomics.wait() must not block the
  //    event loop.
  const verifierUrl = `${verifierBase}/verifier?sessionId=${sessionId}`;
  log('info', `Setting up with verifier via IoChannel: ${verifierUrl}`);
  const verifierIo = await fromWebSocket(verifierUrl);
  await prover.setup(verifierIo);
  log('info', 'Prover setup complete');

  // 5. Send HTTP request through proxy via IoChannel
  const proxyUrl = `${verifierBase}/proxy?token=${serverName}`;
  const encoder = new TextEncoder();
  const headers = new Map();
  headers.set('Host', Array.from(encoder.encode(serverName)));
  headers.set('Accept', Array.from(encoder.encode('application/json')));
  headers.set('Connection', Array.from(encoder.encode('close')));

  log('info', `Sending HTTP request via IoChannel proxy: ${proxyUrl}`);
  const proxyIo = await fromWebSocket(proxyUrl);
  await prover.send_request(proxyIo, {
    uri: requestPath,
    method: 'GET',
    headers,
    body: undefined,
  });
  log('info', 'HTTP request completed');

  // 6. Get transcript
  const transcript = prover.transcript();
  const sent = new Uint8Array(transcript.sent);
  const recv = new Uint8Array(transcript.recv);
  log(
    'info',
    `Transcript: sent=${sent.length} bytes, recv=${recv.length} bytes`,
  );

  // 7. Build reveal config (reveal everything)
  const sentRanges = [
    { start: 0, end: sent.length, handler: { type: 'SENT', part: 'ALL' } },
  ];
  const recvRanges = [
    { start: 0, end: recv.length, handler: { type: 'RECV', part: 'ALL' } },
  ];

  // 8. Send reveal config to verifier via session WebSocket
  session.sendRevealConfig(sentRanges, recvRanges);

  // 9. Reveal to verifier (MPC finalization)
  await prover.reveal({
    sent: [{ start: 0, end: sent.length }],
    recv: [{ start: 0, end: recv.length }],
    server_identity: true,
  });
  log('info', 'Reveal complete');

  // 10. Wait for session completion
  const results = await session.waitForCompletion();
  log('info', `Session completed with ${results.length} results`);

  // 11. Cleanup
  const recvStr = new TextDecoder().decode(recv);
  prover.free();
  session.close();

  return {
    sessionId,
    sentLength: sent.length,
    recvLength: recv.length,
    resultsLength: results.length,
    recvStr,
  };
}

// ============================================================================
// Message handler
// ============================================================================

self.onmessage = async (event) => {
  if (event.data.type !== 'run') return;

  try {
    const data = await runProve(event.data.config);
    self.postMessage({ type: 'result', success: true, data });
  } catch (error) {
    log('error', `Prove failed: ${error.message}\n${error.stack || ''}`);
    self.postMessage({ type: 'result', success: false, error: error.message });
  }
};
