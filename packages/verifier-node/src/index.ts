/**
 * TLSNotary Verifier running in Node.js using WASM.
 *
 * Drop-in replacement for the Rust verifier (packages/verifier).
 * Same WebSocket protocol, same endpoints:
 *   GET  /health               → "ok"
 *   WS   /session              → Session registration (extension)
 *   WS   /verifier?sessionId=  → Prover connection (MPC-TLS)
 *   WS   /proxy?token=         → WebSocket-to-TCP proxy bridge
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { loadWasm } from './wasm-loader.js';
import {
  setVerifierClass,
  handleSessionConnection,
  handleProverConnection,
} from './session.js';
import { handleProxyConnection } from './proxy.js';

const PORT = parseInt(process.env.PORT ?? '7047', 10);

async function main() {
  // 1. Load WASM module.
  console.log('Loading WASM module...');
  const { Verifier } = await loadWasm();
  setVerifierClass(Verifier);
  console.log('WASM module loaded successfully');

  // 2. Create HTTP server for health endpoint + WebSocket upgrade.
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '', `http://localhost:${PORT}`);

    if (url.pathname === '/health') {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      });
      res.end('ok');
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  // 3. Create WebSocket server (no-server mode — we handle upgrade manually).
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', `http://localhost:${PORT}`);

    if (url.pathname === '/session') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleSessionConnection(ws);
      });
    } else if (url.pathname === '/verifier') {
      const sessionId = url.searchParams.get('sessionId') ?? '';
      if (!sessionId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (!handleProverConnection(sessionId, ws)) {
          ws.close(4004, 'Session not found');
        }
      });
    } else if (url.pathname === '/proxy') {
      const host =
        url.searchParams.get('token') ?? url.searchParams.get('host') ?? '';
      if (!host) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleProxyConnection(ws, host);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  // 4. Start listening.
  server.listen(PORT, () => {
    console.log(`TLSNotary Node.js Verifier listening on http://localhost:${PORT}`);
    console.log(`  Health:   http://localhost:${PORT}/health`);
    console.log(`  Session:  ws://localhost:${PORT}/session`);
    console.log(`  Verifier: ws://localhost:${PORT}/verifier?sessionId=<id>`);
    console.log(`  Proxy:    ws://localhost:${PORT}/proxy?token=<host>`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
