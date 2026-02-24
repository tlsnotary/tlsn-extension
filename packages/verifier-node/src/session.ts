/**
 * Session manager implementing the same WebSocket protocol as the Rust verifier.
 *
 * Protocol:
 *   1. Extension sends: { type: "register", maxRecvData, maxSentData, sessionData? }
 *   2. Server responds: { type: "session_registered", sessionId }
 *   3. Prover connects on /verifier?sessionId=<id>
 *   4. WASM Verifier runs MPC-TLS verification
 *   5. Extension sends: { type: "reveal_config", sent: [...], recv: [...] }
 *   6. Server responds: { type: "session_completed", results: [...] }
 */

import { randomUUID } from 'crypto';
import type WebSocket from 'ws';
import { createIoChannel } from './ws-io-channel.js';

// ============================================================================
// Protocol types (matching Rust verifier's serde format)
// ============================================================================

interface Handler {
  type: 'SENT' | 'RECV';
  part:
    | 'START_LINE'
    | 'PROTOCOL'
    | 'METHOD'
    | 'REQUEST_TARGET'
    | 'STATUS_CODE'
    | 'HEADERS'
    | 'BODY'
    | 'ALL';
}

interface RangeWithHandler {
  start: number;
  end: number;
  handler: Handler;
}

interface RegisterMessage {
  type: 'register';
  maxRecvData: number;
  maxSentData: number;
  sessionData?: Record<string, string>;
}

interface RevealConfigMessage {
  type: 'reveal_config';
  sent: RangeWithHandler[];
  recv: RangeWithHandler[];
}

type ClientMessage = RegisterMessage | RevealConfigMessage;

interface HandlerResult {
  type: string;
  part: string;
  value: string;
}

// ============================================================================
// Session state
// ============================================================================

interface PendingSession {
  maxRecvData: number;
  maxSentData: number;
  sessionData: Record<string, string>;
  /** Resolves when the prover WebSocket connects on /verifier */
  resolveProverSocket: (ws: WebSocket) => void;
  proverSocketPromise: Promise<WebSocket>;
}

const sessions = new Map<string, PendingSession>();

// ============================================================================
// WASM Verifier type (from tlsn_wasm.d.ts)
// ============================================================================

interface VerifierConfig {
  max_sent_data: number;
  max_recv_data: number;
}

interface PartialTranscript {
  sent: number[];
  sent_authed: { start: number; end: number }[];
  recv: number[];
  recv_authed: { start: number; end: number }[];
}

interface VerifierOutput {
  server_name: string | undefined;
  connection_info: {
    time: number;
    version: string;
    transcript_length: { sent: number; recv: number };
  };
  transcript: PartialTranscript | undefined;
}

interface WasmVerifier {
  connect(prover_io: any): Promise<void>;
  verify(): Promise<VerifierOutput>;
  free(): void;
}

interface WasmVerifierConstructor {
  new (config: VerifierConfig): WasmVerifier;
}

// ============================================================================
// Public API
// ============================================================================

let VerifierClass: WasmVerifierConstructor;

/** Must be called once at startup with the WASM Verifier class. */
export function setVerifierClass(cls: WasmVerifierConstructor) {
  VerifierClass = cls;
}

/**
 * Handles a prover connecting on /verifier?sessionId=<id>.
 * Passes the WebSocket to the waiting session.
 */
export function handleProverConnection(
  sessionId: string,
  ws: WebSocket,
): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    console.error(`[${sessionId}] Session not found or already connected`);
    return false;
  }
  // Remove from pending sessions — one connection per session.
  sessions.delete(sessionId);
  session.resolveProverSocket(ws);
  console.log(`[${sessionId}] Prover socket passed to verifier`);
  return true;
}

/**
 * Handles the session WebSocket connection (extension side).
 * Runs the full register → verify → respond lifecycle.
 */
export async function handleSessionConnection(ws: WebSocket): Promise<void> {
  const sessionId = randomUUID();
  console.log(`[${sessionId}] New session WebSocket connected`);

  try {
    // 1. Wait for "register" message.
    const registerMsg = await waitForMessage<RegisterMessage>(
      ws,
      sessionId,
      'register',
    );

    console.log(
      `[${sessionId}] Registered: maxRecvData=${registerMsg.maxRecvData}, maxSentData=${registerMsg.maxSentData}`,
    );

    // 2. Create pending session so /verifier handler can resolve it.
    let resolveProverSocket!: (ws: WebSocket) => void;
    const proverSocketPromise = new Promise<WebSocket>((resolve) => {
      resolveProverSocket = resolve;
    });

    sessions.set(sessionId, {
      maxRecvData: registerMsg.maxRecvData,
      maxSentData: registerMsg.maxSentData,
      sessionData: registerMsg.sessionData ?? {},
      resolveProverSocket,
      proverSocketPromise,
    });

    // 3. Send session_registered.
    sendJson(ws, { type: 'session_registered', sessionId });
    console.log(`[${sessionId}] Sent session_registered`);

    // 4. Wait for prover WebSocket connection (with timeout).
    const proverSocket = await withTimeout(
      proverSocketPromise,
      30_000,
      `[${sessionId}] Timed out waiting for prover connection`,
    );

    console.log(`[${sessionId}] Prover connected, starting verification`);

    // 5. Create WASM Verifier and run MPC-TLS protocol.
    const verifier = new VerifierClass({
      max_sent_data: registerMsg.maxSentData,
      max_recv_data: registerMsg.maxRecvData,
    });

    const proverIo = createIoChannel(proverSocket);

    // Run connect + verify concurrently with waiting for reveal_config.
    const [verifierOutput, revealConfig] = await Promise.all([
      runVerification(verifier, proverIo, sessionId),
      waitForMessage<RevealConfigMessage>(ws, sessionId, 'reveal_config'),
    ]);

    console.log(
      `[${sessionId}] Verification complete, server_name=${verifierOutput.server_name}`,
    );

    // 6. Process results.
    const transcript = verifierOutput.transcript;
    if (!transcript) {
      sendError(ws, 'No transcript in verification output');
      return;
    }

    // Validate reveal_config ranges against authenticated transcript.
    validateRevealConfig(revealConfig, transcript, sessionId);

    // Extract handler results from transcript bytes.
    const results = extractHandlerResults(revealConfig, transcript, sessionId);

    // 7. Send session_completed.
    sendJson(ws, { type: 'session_completed', results });
    console.log(
      `[${sessionId}] Sent session_completed with ${results.length} results`,
    );

    verifier.free();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${sessionId}] Error: ${message}`);
    sendError(ws, message);
  } finally {
    // Clean up if session still pending.
    sessions.delete(sessionId);
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

async function runVerification(
  verifier: WasmVerifier,
  proverIo: any,
  sessionId: string,
): Promise<VerifierOutput> {
  console.log(`[${sessionId}] Connecting to prover...`);
  await verifier.connect(proverIo);
  console.log(`[${sessionId}] Connected, running verification...`);
  const output = await verifier.verify();
  console.log(`[${sessionId}] Verification complete`);
  return output;
}

function validateRevealConfig(
  config: RevealConfigMessage,
  transcript: PartialTranscript,
  sessionId: string,
) {
  const validateRanges = (
    ranges: RangeWithHandler[],
    authed: { start: number; end: number }[],
    direction: string,
  ) => {
    for (const range of ranges) {
      const isAuthed = authed.some(
        (a) => a.start <= range.start && range.end <= a.end,
      );
      if (!isAuthed) {
        throw new Error(
          `[${sessionId}] Invalid ${direction} range [${range.start}, ${range.end}) - not within authenticated ranges`,
        );
      }
    }
  };

  validateRanges(config.sent, transcript.sent_authed, 'sent');
  validateRanges(config.recv, transcript.recv_authed, 'recv');
  console.log(
    `[${sessionId}] All reveal_config ranges validated against authenticated transcript`,
  );
}

function extractHandlerResults(
  config: RevealConfigMessage,
  transcript: PartialTranscript,
  sessionId: string,
): HandlerResult[] {
  const results: HandlerResult[] = [];

  const processRanges = (
    ranges: RangeWithHandler[],
    bytes: number[],
    direction: string,
  ) => {
    for (const range of ranges) {
      if (range.start < bytes.length && range.end <= bytes.length) {
        const extracted = bytes.slice(range.start, range.end);
        const value = new TextDecoder().decode(new Uint8Array(extracted));
        results.push({
          type: range.handler.type,
          part: range.handler.part,
          value,
        });
      } else {
        console.error(
          `[${sessionId}] Invalid ${direction} range [${range.start}, ${range.end})`,
        );
      }
    }
  };

  processRanges(config.sent, transcript.sent, 'sent');
  processRanges(config.recv, transcript.recv, 'recv');

  return results;
}

function waitForMessage<T extends ClientMessage>(
  ws: WebSocket,
  sessionId: string,
  expectedType: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        if (msg.type === expectedType) {
          ws.off('message', onMessage);
          ws.off('close', onClose);
          ws.off('error', onError);
          resolve(msg as T);
        }
      } catch (err) {
        ws.off('message', onMessage);
        ws.off('close', onClose);
        ws.off('error', onError);
        reject(
          new Error(
            `[${sessionId}] Failed to parse message: ${err}`,
          ),
        );
      }
    };

    const onClose = () => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(
        new Error(
          `[${sessionId}] Connection closed before receiving ${expectedType}`,
        ),
      );
    };

    const onError = (err: Error) => {
      ws.off('message', onMessage);
      ws.off('close', onClose);
      reject(err);
    };

    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

function sendJson(ws: WebSocket, data: unknown) {
  ws.send(JSON.stringify(data));
}

function sendError(ws: WebSocket, message: string) {
  try {
    sendJson(ws, { type: 'error', message });
  } catch {
    // Socket may already be closed.
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
