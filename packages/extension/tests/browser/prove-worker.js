/**
 * Web Worker that runs the full MPC-TLS prove flow using the tlsn WASM prover.
 *
 * Mirrors the single-WebSocket protocol used by the production extension worker
 * (src/offscreen/ProveManager/worker.ts): one `/session` WebSocket multiplexes
 * Text frames (register, reveal_config, session_completed) and Binary frames
 * (MPC bytes). The WASM prover consumes the binary stream via an IoChannel
 * built on top of the same socket; text frames are handled by the worker.
 *
 * Communication protocol (with main thread):
 *   Main thread → Worker: { type: 'run', config: { ... } }
 *   Worker → Main thread: { type: 'log', level, message }
 *   Worker → Main thread: { type: 'result', success, data }
 */

import { fromWebSocket } from '/@tlsn-common/io-channel.js';

// ============================================================================
// Session WebSocket: single socket multiplexing Text (control) + Binary (MPC).
// ============================================================================

class SessionClient {
  constructor() {
    this.ws = null;
    this.binaryQueue = [];
    this.binaryResolver = null;
    this.textQueue = [];
    this.textResolver = null;
    this.closed = false;
    this.error = null;
  }

  async connectAndRegister(verifierBase, sessionData) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${verifierBase}/session`);
      this.ws.binaryType = 'arraybuffer';
      let registered = false;

      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ type: 'register', sessionData }));
      };

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch (err) {
            reject(new Error(`Invalid JSON from server: ${err.message}`));
            return;
          }
          if (!registered) {
            if (msg.type === 'registered') {
              registered = true;
              resolve();
            } else if (msg.type === 'error') {
              reject(new Error(`Server error during register: ${msg.message}`));
            } else {
              reject(new Error(`Unexpected server message before registered: ${msg.type}`));
            }
            return;
          }
          if (this.textResolver) {
            const r = this.textResolver;
            this.textResolver = null;
            r(msg);
          } else {
            this.textQueue.push(msg);
          }
        } else {
          const data = new Uint8Array(event.data);
          if (this.binaryResolver) {
            const r = this.binaryResolver;
            this.binaryResolver = null;
            r(data);
          } else {
            this.binaryQueue.push(data);
          }
        }
      };

      this.ws.onerror = (event) => {
        const err = new Error(`Session WebSocket error: ${event.type || 'unknown'}`);
        this.error = err;
        if (!registered) reject(err);
      };

      this.ws.onclose = () => {
        this.closed = true;
        if (this.binaryResolver) {
          const r = this.binaryResolver;
          this.binaryResolver = null;
          r(null);
        }
        if (this.textResolver) {
          const r = this.textResolver;
          this.textResolver = null;
          r(null);
        }
        if (!registered) reject(new Error('Session WebSocket closed before registration'));
      };
    });
  }

  /**
   * IoChannel view over the binary frames of the session WebSocket. The WASM
   * prover reads/writes MPC bytes through this channel; text frames on the
   * same socket are routed separately to textQueue.
   */
  binaryIo() {
    return {
      read: async () => {
        if (this.error) throw this.error;
        if (this.binaryQueue.length > 0) return this.binaryQueue.shift();
        if (this.closed) return null;
        return new Promise((resolve) => {
          this.binaryResolver = resolve;
        });
      },
      write: async (data) => {
        if (this.error) throw this.error;
        if (this.closed) throw new Error('Session WebSocket is closed');
        this.ws.send(data);
      },
      // No-op: the session WS is closed by close(), not by the WASM prover
      // dropping its IoChannel (we still need the socket for reveal_config +
      // session_completed after MPC finishes).
      close: async () => {},
    };
  }

  sendRevealConfig(sent, recv) {
    this.ws.send(JSON.stringify({ type: 'reveal_config', sent, recv }));
  }

  async waitForCompletion(timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Timed out waiting for session_completed');
      const msg = await Promise.race([
        this._recvText(),
        new Promise((resolve) => setTimeout(() => resolve('__timeout__'), remaining)),
      ]);
      if (msg === '__timeout__') throw new Error('Timed out waiting for session_completed');
      if (!msg) throw new Error('Session WebSocket closed before session_completed');
      if (msg.type === 'session_completed') return msg.results;
      if (msg.type === 'error') throw new Error(`Server error: ${msg.message}`);
      // Ignore unexpected types.
    }
  }

  _recvText() {
    if (this.textQueue.length > 0) return Promise.resolve(this.textQueue.shift());
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.textResolver = resolve;
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
  const { verifierPort, serverName, requestPath, maxSentData, maxRecvData, threads } = config;

  const verifierBase = `ws://127.0.0.1:${verifierPort}`;

  // 1. Init WASM
  log('info', 'Loading WASM module...');
  const wasm = await import('/@tlsn-wasm/tlsn_wasm.js');
  await wasm.default();
  await wasm.initialize(null, threads);
  log('info', 'WASM initialized');

  // 2. Open session WS and register. Server-side max data ceilings now come
  //    from the verifier's config.yaml, so the register message carries only
  //    sessionData.
  const session = new SessionClient();
  await session.connectAndRegister(verifierBase, { test: 'browser-prove' });
  log('info', 'Session registered');

  // 3. Create prover
  const prover = new wasm.Prover({
    server_name: serverName,
    max_sent_data: maxSentData,
    max_recv_data: maxRecvData,
    network: 'Bandwidth',
  });

  // 4. Run MPC setup over the session's binary channel (same WebSocket).
  log('info', 'Setting up prover with verifier via session binary channel');
  await prover.setup(session.binaryIo());
  log('info', 'Prover setup complete');

  // 5. Send HTTP request via the proxy WebSocket (binary-only, separate socket).
  const proxyUrl = `${verifierBase}/proxy?token=${serverName}`;
  const encoder = new TextEncoder();
  const headers = new Map();
  headers.set('Host', Array.from(encoder.encode(serverName)));
  headers.set('Accept', Array.from(encoder.encode('application/json')));
  headers.set('Connection', Array.from(encoder.encode('close')));

  log('info', `Sending HTTP request via proxy: ${proxyUrl}`);
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
  log('info', `Transcript: sent=${sent.length} bytes, recv=${recv.length} bytes`);

  // 7. Build reveal config (reveal everything) and send it as a Text frame on
  //    the session WS BEFORE running prover.reveal(). The server expects the
  //    reveal_config text frame; the MPC reveal then flows over binary frames.
  const sentRanges = [{ start: 0, end: sent.length, handler: { type: 'SENT', part: 'ALL' } }];
  const recvRanges = [{ start: 0, end: recv.length, handler: { type: 'RECV', part: 'ALL' } }];
  session.sendRevealConfig(sentRanges, recvRanges);

  // 8. Reveal to verifier (more MPC binary on the session channel).
  await prover.reveal({
    sent: [{ start: 0, end: sent.length }],
    recv: [{ start: 0, end: recv.length }],
    server_identity: true,
  });
  log('info', 'Reveal complete');

  // 9. Wait for the server's session_completed text frame.
  const results = await session.waitForCompletion();
  log('info', `Session completed with ${results.length} results`);

  // 10. Cleanup
  const recvStr = new TextDecoder().decode(recv);
  prover.free();
  session.close();

  return {
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
