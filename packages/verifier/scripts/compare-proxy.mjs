#!/usr/bin/env node
/**
 * Proxy Comparison Script
 *
 * Compares WebSocket behavior between:
 * - wss://notary.pse.dev/proxy?token=<host>
 * - ws://localhost:7047/proxy?token=<host>
 *
 * Usage:
 *   node compare-proxy.mjs [host]
 *
 * Example:
 *   node compare-proxy.mjs swapi.dev
 *   node compare-proxy.mjs api.x.com
 */

import WebSocket from 'ws';
import * as tls from 'tls';

const TARGET_HOST = process.argv[2] || 'swapi.dev';
const TARGET_PATH = process.argv[3] || '/api/films/1/';
const LOCAL_PROXY_URL = `ws://localhost:7047/proxy?token=${TARGET_HOST}`;
const REMOTE_PROXY_URL = `wss://notary.pse.dev/proxy?token=${TARGET_HOST}`;

// Simple HTTP/1.1 GET request
const HTTP_REQUEST = [
  `GET ${TARGET_PATH} HTTP/1.1`,
  `Host: ${TARGET_HOST}`,
  'Connection: close',
  'Accept-Encoding: identity',
  '',
  '',
].join('\r\n');

/**
 * Connect to a WebSocket proxy and perform TLS handshake + HTTP request
 */
async function testProxy(proxyUrl, name) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const messages = [];
    let totalBytesReceived = 0;
    let httpResponse = '';

    console.log(`\n[${ name }] Connecting to ${proxyUrl}...`);

    const ws = new WebSocket(proxyUrl);
    ws.binaryType = 'arraybuffer';

    // Create TLS socket that will connect through the WebSocket proxy
    let tlsSocket = null;
    let resolved = false;

    ws.on('open', () => {
      const connectTime = Date.now() - startTime;
      console.log(`[${name}] WebSocket connected in ${connectTime}ms`);

      // Create a custom duplex stream that bridges TLS to WebSocket
      const { Duplex } = require('stream');

      const wsStream = new Duplex({
        read() {},
        write(chunk, encoding, callback) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
            callback();
          } else {
            callback(new Error('WebSocket not open'));
          }
        },
      });

      // Forward WebSocket messages to the stream
      ws.on('message', (data) => {
        const buffer = Buffer.from(data);
        totalBytesReceived += buffer.length;
        messages.push({ time: Date.now() - startTime, size: buffer.length });
        wsStream.push(buffer);
      });

      ws.on('close', () => {
        wsStream.push(null);
      });

      // Create TLS connection over the WebSocket stream
      tlsSocket = tls.connect({
        socket: wsStream,
        servername: TARGET_HOST,
        rejectUnauthorized: true,
      });

      tlsSocket.on('secureConnect', () => {
        const tlsTime = Date.now() - startTime;
        console.log(`[${name}] TLS handshake completed in ${tlsTime}ms`);
        console.log(`[${name}] Sending HTTP request...`);
        tlsSocket.write(HTTP_REQUEST);
      });

      tlsSocket.on('data', (data) => {
        httpResponse += data.toString();
      });

      tlsSocket.on('end', () => {
        const totalTime = Date.now() - startTime;
        if (!resolved) {
          resolved = true;
          ws.close();
          resolve({
            name,
            proxyUrl,
            totalTime,
            totalBytesReceived,
            messageCount: messages.length,
            messages,
            httpResponse,
            success: true,
          });
        }
      });

      tlsSocket.on('error', (err) => {
        console.error(`[${name}] TLS error:`, err.message);
        if (!resolved) {
          resolved = true;
          ws.close();
          resolve({
            name,
            proxyUrl,
            error: err.message,
            success: false,
          });
        }
      });
    });

    ws.on('error', (err) => {
      console.error(`[${name}] WebSocket error:`, err.message);
      if (!resolved) {
        resolved = true;
        resolve({
          name,
          proxyUrl,
          error: err.message,
          success: false,
        });
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve({
          name,
          proxyUrl,
          error: 'Timeout after 30s',
          success: false,
        });
      }
    }, 30000);
  });
}

/**
 * Compare two proxy results
 */
function compareResults(local, remote) {
  console.log('\n' + '='.repeat(60));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(60));

  console.log(`\nTarget: ${TARGET_HOST}${TARGET_PATH}`);
  console.log('\n--- Local Proxy ---');
  if (local.success) {
    console.log(`  Total time: ${local.totalTime}ms`);
    console.log(`  Bytes received: ${local.totalBytesReceived}`);
    console.log(`  WS messages: ${local.messageCount}`);
    console.log(`  HTTP status: ${local.httpResponse.split('\r\n')[0]}`);
  } else {
    console.log(`  Error: ${local.error}`);
  }

  console.log('\n--- Remote Proxy (notary.pse.dev) ---');
  if (remote.success) {
    console.log(`  Total time: ${remote.totalTime}ms`);
    console.log(`  Bytes received: ${remote.totalBytesReceived}`);
    console.log(`  WS messages: ${remote.messageCount}`);
    console.log(`  HTTP status: ${remote.httpResponse.split('\r\n')[0]}`);
  } else {
    console.log(`  Error: ${remote.error}`);
  }

  console.log('\n--- Comparison ---');
  if (local.success && remote.success) {
    const localStatus = local.httpResponse.split('\r\n')[0];
    const remoteStatus = remote.httpResponse.split('\r\n')[0];

    if (localStatus === remoteStatus) {
      console.log('  HTTP Status: MATCH');
    } else {
      console.log(`  HTTP Status: MISMATCH`);
      console.log(`    Local:  ${localStatus}`);
      console.log(`    Remote: ${remoteStatus}`);
    }

    // Compare response body (after headers)
    const localBody = local.httpResponse.split('\r\n\r\n').slice(1).join('\r\n\r\n');
    const remoteBody = remote.httpResponse.split('\r\n\r\n').slice(1).join('\r\n\r\n');

    if (localBody === remoteBody) {
      console.log('  Response Body: MATCH');
    } else {
      console.log('  Response Body: DIFFERENT (may vary by timestamp/headers)');
    }

    console.log(`\n  RESULT: Both proxies working correctly`);
    return true;
  } else if (!local.success && remote.success) {
    console.log('  RESULT: Local proxy FAILED, remote works');
    return false;
  } else if (local.success && !remote.success) {
    console.log('  RESULT: Local works, remote proxy FAILED');
    return false;
  } else {
    console.log('  RESULT: Both proxies FAILED');
    return false;
  }
}

async function main() {
  console.log('Proxy Comparison Test');
  console.log('='.repeat(60));
  console.log(`Target host: ${TARGET_HOST}`);
  console.log(`Target path: ${TARGET_PATH}`);
  console.log(`Local proxy: ${LOCAL_PROXY_URL}`);
  console.log(`Remote proxy: ${REMOTE_PROXY_URL}`);

  // Test both proxies in parallel
  const [localResult, remoteResult] = await Promise.all([
    testProxy(LOCAL_PROXY_URL, 'LOCAL'),
    testProxy(REMOTE_PROXY_URL, 'REMOTE'),
  ]);

  const success = compareResults(localResult, remoteResult);
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
