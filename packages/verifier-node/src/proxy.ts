/**
 * WebSocket-to-TCP proxy bridge.
 *
 * Mirrors the Rust verifier's /proxy endpoint: receives WebSocket binary
 * frames from the prover and forwards them to a TCP connection to the
 * target server (e.g., api.x.com:443), and vice versa.
 */

import * as net from 'net';
import { randomUUID } from 'crypto';
import type WebSocket from 'ws';

/**
 * Handles a proxy WebSocket connection by bridging to TCP.
 * @param ws - Incoming WebSocket from the prover
 * @param host - Target host, e.g. "api.x.com" or "api.x.com:443"
 */
export function handleProxyConnection(ws: WebSocket, host: string): void {
  const proxyId = randomUUID().slice(0, 8);

  // Parse host and port (default 443 for HTTPS).
  let hostname: string;
  let port: number;
  if (host.includes(':')) {
    const parts = host.split(':');
    hostname = parts[0];
    port = parseInt(parts[1], 10) || 443;
  } else {
    hostname = host;
    port = 443;
  }

  console.log(`[proxy:${proxyId}] Connecting to ${hostname}:${port}`);

  const tcp = net.createConnection({ host: hostname, port }, () => {
    console.log(
      `[proxy:${proxyId}] TCP connection established to ${hostname}:${port}`,
    );
  });

  let wsBytesForwarded = 0;
  let tcpBytesForwarded = 0;

  // WebSocket → TCP: forward binary frames to TCP socket.
  ws.on('message', (data: Buffer) => {
    wsBytesForwarded += data.length;
    tcp.write(data);
  });

  // TCP → WebSocket: forward TCP data as binary WebSocket frames.
  tcp.on('data', (data: Buffer) => {
    tcpBytesForwarded += data.length;
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });

  // TCP EOF → close WebSocket.
  tcp.on('end', () => {
    console.log(
      `[proxy:${proxyId}] TCP EOF, forwarded ${tcpBytesForwarded} bytes to WS`,
    );
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
  });

  tcp.on('error', (err) => {
    console.error(`[proxy:${proxyId}] TCP error: ${err.message}`);
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
  });

  // WebSocket close → close TCP.
  ws.on('close', () => {
    console.log(
      `[proxy:${proxyId}] WS closed, forwarded ${wsBytesForwarded} bytes to TCP`,
    );
    tcp.destroy();
  });

  ws.on('error', (err) => {
    console.error(`[proxy:${proxyId}] WS error: ${err.message}`);
    tcp.destroy();
  });
}
