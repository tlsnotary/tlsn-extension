import * as Comlink from 'comlink';
import type { Handler } from '@tlsn/plugin-sdk';
import initWasm, {
  LoggingLevel,
  LoggingConfig,
  initialize,
  Prover,
  CrateLogFilter,
  ProverConfig,
  HttpRequest,
  Reveal,
  compute_reveal as wasmComputeReveal,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';

// ============================================================================
// Console interception for WASM progress reporting
// Captures Rust tracing output routed to console by wasm-tracing and maps
// known messages to progress steps, forwarding them via postMessage.
// ============================================================================

const PROGRESS_PATTERNS: Array<{
  pattern: RegExp;
  step: string;
  progress: number;
  label: string;
}> = [
  {
    pattern: /connecting to verifier/i,
    step: 'VERIFIER_CONNECTING',
    progress: 0.05,
    label: 'Connecting to verifier...',
  },
  {
    pattern: /setup complete/i,
    step: 'MPC_SETUP_COMPLETE',
    progress: 0.15,
    label: 'MPC setup complete',
  },
  {
    pattern: /connecting to server/i,
    step: 'SERVER_CONNECTING',
    progress: 0.25,
    label: 'Connecting to server...',
  },
  {
    pattern: /sending request/i,
    step: 'HTTP_SENDING',
    progress: 0.35,
    label: 'Sending request...',
  },
  {
    pattern: /response received/i,
    step: 'HTTP_RESPONSE_RECEIVED',
    progress: 0.5,
    label: 'Response received',
  },
  {
    pattern: /reveal\(\) called/i,
    step: 'PROOF_GENERATING',
    progress: 0.7,
    label: 'Generating proof...',
  },
  {
    pattern: /\bfinalized\b/i,
    step: 'PROOF_FINALIZED',
    progress: 0.9,
    label: 'Proof finalized',
  },
];

// Store original console methods so they can be restored if needed.
const _originalConsoleLog = console.log;
const _originalConsoleDebug = console.debug;
const _originalConsoleInfo = console.info;

function interceptConsole(originalFn: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    originalFn.apply(console, args);
    // Pattern-match against raw args (works even with %c formatting).
    // NOTE: This is a stop-gap until the WASM side exposes a structured
    // progress callback (e.g. set_progress_callback(fn)). Console parsing
    // is fragile — Rust tracing format changes will silently break it.
    const raw = args.map(String).join(' ');
    for (const { pattern, step, progress, label } of PROGRESS_PATTERNS) {
      if (pattern.test(raw)) {
        self.postMessage({
          type: 'WASM_PROGRESS',
          step,
          progress,
          message: label,
        });
        break;
      }
    }
  };
}

console.log = interceptConsole(_originalConsoleLog);
console.debug = interceptConsole(_originalConsoleDebug);
console.info = interceptConsole(_originalConsoleInfo);

// IoChannel interface for bidirectional byte streams (matches Rust JsIo extern)
interface IoChannel {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

// ============================================================================
// Session WebSocket: one WebSocket per session, carrying both JSON control
// frames (Text) and MPC bytes (Binary). Mirrors the server's ws_mux.
// ============================================================================

/**
 * Server → client message shapes (must stay in sync with Rust ServerMessage).
 */
type ServerMessage =
  | { type: 'registered' }
  | { type: 'session_completed'; results: unknown[] }
  | { type: 'error'; message: string };

interface SessionState {
  ws: WebSocket;
  // Binary frames inbox (MPC bytes from the server, consumed by the WASM
  // prover's IoChannel.read).
  binaryQueue: Uint8Array[];
  binaryResolver: ((value: Uint8Array | null) => void) | null;
  // Text frames inbox (session_completed, error).
  textQueue: ServerMessage[];
  textResolver: ((value: ServerMessage | null) => void) | null;
  closed: boolean;
  error: Error | null;
}

const sessions: Map<string, SessionState> = new Map();
let nextSessionId = 0;

/**
 * Open a session WebSocket and perform the `register` handshake. On success
 * returns an internal session id that can be passed to other session methods.
 */
async function createSession(
  verifierUrl: string,
  sessionData: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(verifierUrl);
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
    const pathname = url.pathname === '/' ? '' : url.pathname;
    const sessionWsUrl = `${protocol}://${url.host}${pathname}/session`;

    const ws = new WebSocket(sessionWsUrl);
    ws.binaryType = 'arraybuffer';

    const state: SessionState = {
      ws,
      binaryQueue: [],
      binaryResolver: null,
      textQueue: [],
      textResolver: null,
      closed: false,
      error: null,
    };

    const id = `session-${nextSessionId++}`;
    let registered = false;

    ws.onopen = () => {
      const msg = { type: 'register', sessionData };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        // Text frame: JSON control message.
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch (err) {
          console.error('[Worker] Invalid JSON from server:', err);
          return;
        }

        if (!registered) {
          if (msg.type === 'registered') {
            registered = true;
            sessions.set(id, state);
            resolve(id);
          } else if (msg.type === 'error') {
            reject(new Error(`Server error during register: ${msg.message}`));
          } else {
            reject(new Error(`Unexpected server message before registered: ${msg.type}`));
          }
          return;
        }

        // Post-registration text frames go to the text inbox.
        if (state.textResolver) {
          const resolver = state.textResolver;
          state.textResolver = null;
          resolver(msg);
        } else {
          state.textQueue.push(msg);
        }
      } else {
        // Binary frame: MPC bytes for the WASM prover.
        const data = new Uint8Array(event.data as ArrayBuffer);
        if (state.binaryResolver) {
          const resolver = state.binaryResolver;
          state.binaryResolver = null;
          resolver(data);
        } else {
          state.binaryQueue.push(data);
        }
      }
    };

    ws.onerror = (event) => {
      console.error('[Worker] Session WebSocket error:', sessionWsUrl, event);
      const err = new Error(`Session WebSocket connection failed: ${sessionWsUrl}`);
      state.error = err;
      if (!registered) {
        reject(err);
      }
    };

    ws.onclose = () => {
      state.closed = true;
      if (state.binaryResolver) {
        const resolver = state.binaryResolver;
        state.binaryResolver = null;
        resolver(null);
      }
      if (state.textResolver) {
        const resolver = state.textResolver;
        state.textResolver = null;
        resolver(null);
      }
      if (!registered) {
        reject(new Error('Session WebSocket closed before registration'));
      }
    };
  });
}

/**
 * Builds an IoChannel that reads/writes the session WebSocket's binary frames.
 * This is what the WASM prover uses as its transport for MPC.
 */
function sessionBinaryIo(sessionId: string): IoChannel {
  const state = sessions.get(sessionId);
  if (!state) throw new Error(`Session not found: ${sessionId}`);

  return {
    async read(): Promise<Uint8Array | null> {
      if (state.error) throw state.error;
      if (state.binaryQueue.length > 0) return state.binaryQueue.shift()!;
      if (state.closed) return null;
      return new Promise((resolve) => {
        state.binaryResolver = resolve;
      });
    },
    async write(data: Uint8Array): Promise<void> {
      if (state.error) throw state.error;
      if (state.closed) throw new Error('Session WebSocket is closed');
      state.ws.send(data as Uint8Array<ArrayBuffer>);
    },
    async close(): Promise<void> {
      // The session WebSocket is owned by SessionState and closed via
      // closeSession(). The WASM prover may drop its IoChannel while the
      // session is still in use (to send reveal_config + await completion),
      // so this is a no-op.
    },
  };
}

/** Send a Text frame on the session WebSocket. */
function sendSessionText(sessionId: string, payload: unknown): void {
  const state = sessions.get(sessionId);
  if (!state) throw new Error(`Session not found: ${sessionId}`);
  if (state.closed) throw new Error('Session WebSocket is closed');
  state.ws.send(JSON.stringify(payload));
}

/** Wait for the next Text frame on the session WebSocket. */
async function recvSessionText(sessionId: string): Promise<ServerMessage | null> {
  const state = sessions.get(sessionId);
  if (!state) throw new Error(`Session not found: ${sessionId}`);
  if (state.textQueue.length > 0) return state.textQueue.shift()!;
  if (state.closed) return null;
  return new Promise((resolve) => {
    state.textResolver = resolve;
  });
}

/**
 * Creates an IoChannel adapter from a WebSocket URL. Used for the proxy
 * (server target) connection — the proxy WS carries only binary data.
 */
function createIoChannel(url: string): Promise<IoChannel> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    const readQueue: Uint8Array[] = [];
    let readResolver: ((value: Uint8Array | null) => void) | null = null;
    let closed = false;
    let error: Error | null = null;

    ws.onopen = () => {
      resolve({
        async read(): Promise<Uint8Array | null> {
          if (error) throw error;
          if (readQueue.length > 0) return readQueue.shift()!;
          if (closed) return null;
          return new Promise((res) => {
            readResolver = res;
          });
        },
        async write(data: Uint8Array): Promise<void> {
          if (closed) throw new Error('WebSocket is closed');
          if (error) throw error;
          ws.send(data as Uint8Array<ArrayBuffer>);
        },
        async close(): Promise<void> {
          if (!closed) {
            closed = true;
            ws.close();
          }
        },
      });
    };

    ws.onerror = (event) => {
      console.error('[Worker] WebSocket error:', url, event);
      const err = new Error(`WebSocket connection failed: ${url}`);
      error = err;
      if (!closed) {
        closed = true;
        ws.close();
        reject(err);
      }
    };

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      if (readResolver) {
        const resolver = readResolver;
        readResolver = null;
        resolver(data);
      } else {
        readQueue.push(data);
      }
    };

    ws.onclose = (_event) => {
      closed = true;
      if (readResolver) {
        const resolver = readResolver;
        readResolver = null;
        resolver(null);
      }
    };
  });
}

// Store prover instances in the worker to avoid serialization issues.
const provers: Map<string, Prover> = new Map();
let nextProverId = 0;

/**
 * Creates a new Prover instance and returns its ID.
 * Wires up the structured progress callback so the WASM prover emits
 * progress events via postMessage instead of relying on console interception.
 */
async function createProver(config: ProverConfig): Promise<string> {
  const prover = new Prover(config);
  const id = `prover-${nextProverId++}`;

  // Wire up structured progress callback from WASM.
  // This is the preferred path; console interception above is the fallback.
  prover.set_progress_callback(
    (data: { step: string; progress: number; message: string; source: string }) => {
      self.postMessage({
        type: 'WASM_PROGRESS',
        step: data.step,
        progress: data.progress,
        message: data.message,
        source: data.source,
      });
    },
  );

  provers.set(id, prover);
  return id;
}

/** Default timeout for prover setup (30 seconds). */
const SETUP_TIMEOUT_MS = 30_000;

/**
 * Run the prover's MPC setup handshake over the given session's binary
 * channel.
 */
async function setupProver(proverId: string, sessionId: string): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  const verifierIo = sessionBinaryIo(sessionId);
  await Promise.race([
    prover.setup(verifierIo),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`setupProver timed out after ${SETUP_TIMEOUT_MS}ms for ${proverId}`)),
        SETUP_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Sends an HTTP request through the prover via WebSocket proxy URL.
 */
/** Default timeout for send request (60 seconds). */
const SEND_REQUEST_TIMEOUT_MS = 60_000;

async function sendRequest(
  proverId: string,
  proxyUrl: string,
  request: HttpRequest,
): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  const serverIo = await createIoChannel(proxyUrl);
  try {
    await Promise.race([
      prover.send_request(serverIo, request),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`sendRequest timed out after ${SEND_REQUEST_TIMEOUT_MS}ms for ${proverId}`),
            ),
          SEND_REQUEST_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    await serverIo.close();
    throw err;
  }
}

/**
 * Returns the transcript from the prover.
 * Converts WASM object to plain JS to avoid structured clone issues.
 */
function getTranscript(proverId: string): { sent: number[]; recv: number[] } {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);
  const transcript = prover.transcript();
  return {
    sent: Array.from(transcript.sent),
    recv: Array.from(transcript.recv),
  };
}

/**
 * Reveals data to the verifier.
 */
async function reveal(proverId: string, revealConfig: Reveal): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  await prover.reveal(revealConfig);
}

/**
 * Computes reveal ranges by parsing transcripts and mapping handlers to byte ranges.
 * Runs entirely in the worker to avoid transferring transcript bytes to the main thread.
 */
/** A byte range for reveal operations */
interface RevealRange {
  start: number;
  end: number;
}

/** A byte range paired with handler metadata for the verifier */
interface RevealRangeWithHandler {
  start: number;
  end: number;
  handler: Handler;
}

function computeReveal(
  proverId: string,
  handlers: Handler[],
): {
  sentRanges: RevealRange[];
  recvRanges: RevealRange[];
  sentRangesWithHandlers: RevealRangeWithHandler[];
  recvRangesWithHandlers: RevealRangeWithHandler[];
} {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  const transcript = prover.transcript();

  // Copy byte arrays since they may be WASM memory views that get invalidated
  const sent = new Uint8Array(transcript.sent);
  const recv = new Uint8Array(transcript.recv);

  // WASM returns snake_case fields from serde; validate shape at the boundary
  // since wasm-bindgen returns `any` and Rust format changes would be silent.
  const output: unknown = wasmComputeReveal(sent, recv, handlers);

  if (
    !output ||
    typeof output !== 'object' ||
    !('reveal' in output) ||
    !('sent_ranges_with_handlers' in output) ||
    !('recv_ranges_with_handlers' in output)
  ) {
    throw new Error('compute_reveal returned unexpected shape — WASM binding may have changed');
  }

  const typed = output as {
    reveal: { sent: RevealRange[]; recv: RevealRange[] };
    sent_ranges_with_handlers: RevealRangeWithHandler[];
    recv_ranges_with_handlers: RevealRangeWithHandler[];
  };

  return {
    sentRanges: typed.reveal.sent,
    recvRanges: typed.reveal.recv,
    sentRangesWithHandlers: typed.sent_ranges_with_handlers,
    recvRangesWithHandlers: typed.recv_ranges_with_handlers,
  };
}

/**
 * Sends the reveal_config text frame on the session WebSocket. Called after
 * the WASM prover finishes `reveal()`.
 */
function sendRevealConfig(
  sessionId: string,
  sent: RevealRangeWithHandler[],
  recv: RevealRangeWithHandler[],
): void {
  sendSessionText(sessionId, { type: 'reveal_config', sent, recv });
}

/**
 * Awaits the `session_completed` text frame on the session WebSocket.
 * Throws if the server sends `error` or the socket closes first.
 */
async function awaitSessionCompleted(sessionId: string): Promise<{ results: unknown[] }> {
  // Keep reading until we see session_completed or error.
  while (true) {
    const msg = await recvSessionText(sessionId);
    if (!msg) throw new Error(`Session ${sessionId} closed before completion`);
    if (msg.type === 'session_completed') {
      return { results: msg.results };
    }
    if (msg.type === 'error') {
      throw new Error(`Server error: ${msg.message}`);
    }
    // Ignore unexpected message types.
  }
}

/** Close the session WebSocket and free its state. */
function closeSession(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;
  if (!state.closed) {
    try {
      state.ws.close();
    } catch {
      // ignore
    }
  }
  sessions.delete(sessionId);
}

/**
 * Frees a prover instance.
 */
function freeProver(proverId: string): void {
  const prover = provers.get(proverId);
  if (prover) {
    prover.free();
    provers.delete(proverId);
  }
}

export default async function init(config?: {
  loggingLevel?: LoggingLevel;
  hardwareConcurrency?: number;
  crateFilters?: CrateLogFilter[];
}): Promise<void> {
  const {
    loggingLevel = 'Info',
    hardwareConcurrency = navigator.hardwareConcurrency || 4,
    crateFilters,
  } = config || {};

  try {
    await initWasm();
  } catch (error) {
    console.error('[Worker] initWasm failed:', error);
    throw new Error(`WASM initialization failed: ${error}`);
  }

  // Build logging config - omit undefined fields to avoid WASM signature mismatch
  const loggingConfig: LoggingConfig = {
    level: loggingLevel,
    crate_filters: crateFilters || [],
    span_events: undefined,
  };

  try {
    await initialize(loggingConfig, hardwareConcurrency);
  } catch (error) {
    console.error('[Worker] Initialize failed:', error);
    console.error('[Worker] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });

    // Try one more time with completely null config as fallback
    try {
      await initialize(null, 1);
    } catch (retryError) {
      console.error('[Worker] Retry also failed:', retryError);
      throw new Error(`Initialize failed: ${error}. Retry with null also failed: ${retryError}`);
    }
  }
}

Comlink.expose({
  init,
  createProver,
  createSession,
  setupProver,
  sendRequest,
  getTranscript,
  computeReveal,
  reveal,
  sendRevealConfig,
  awaitSessionCompleted,
  closeSession,
  freeProver,
});
