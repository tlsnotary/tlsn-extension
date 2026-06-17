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
  Commit,
  RevealOutput,
  compute_reveal as wasmComputeReveal,
} from 'tlsn-wasm';

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

// Store prover instances in the worker to avoid serialization issues.
const provers: Map<string, Prover> = new Map();
let nextProverId = 0;

/**
 * Creates an IoChannel adapter from a WebSocket URL.
 * This runs in the worker to avoid cross-thread communication overhead.
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

/**
 * Sets up the prover with the verifier via WebSocket URL.
 */
/** Default timeout for prover setup (30 seconds). */
const SETUP_TIMEOUT_MS = 30_000;

async function setupProver(proverId: string, verifierUrl: string): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  const verifierIo = await createIoChannel(verifierUrl);
  try {
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
  } catch (err) {
    await verifierIo.close();
    throw err;
  }
}

// ============================================================================
// Relay transport
//
// For relayed proofs the verifier runs in another browser. WebRTC lives in
// the host page (not here), so the verifier's bytes are relayed: outbound bytes
// go to a main-thread `sendOut` callback (→ page → data channel); inbound bytes
// are pushed back via deliverToWasm(). This is a plain byte bridge — no WebRTC.
// ============================================================================

let relayInbox: Uint8Array[] = [];
let relayReadResolver: ((value: Uint8Array | null) => void) | null = null;
let relayClosed = false;
let relaySendOut: ((bytes: Uint8Array) => void) | null = null;

function relayIo(): IoChannel {
  return {
    async read(): Promise<Uint8Array | null> {
      if (relayInbox.length > 0) return relayInbox.shift()!;
      if (relayClosed) return null;
      return new Promise((res) => {
        relayReadResolver = res;
      });
    },
    async write(data: Uint8Array): Promise<void> {
      // Copy off (possibly shared) WASM memory before crossing to the main thread.
      relaySendOut?.(data.slice());
    },
    async close(): Promise<void> {
      /* the main thread / page owns the data channel lifecycle */
    },
  };
}

/** Push bytes received from the relay (called from the main thread). */
function deliverToWasm(bytes: Uint8Array): void {
  if (relayReadResolver) {
    const resolve = relayReadResolver;
    relayReadResolver = null;
    resolve(bytes);
  } else {
    relayInbox.push(bytes);
  }
}

/** Signal the relayed channel closed (EOF). */
function signalRelayClosed(): void {
  relayClosed = true;
  if (relayReadResolver) {
    const resolve = relayReadResolver;
    relayReadResolver = null;
    resolve(null);
  }
}

/** Set up the prover over the relayed channel instead of a WebSocket. */
async function setupProverRelay(
  proverId: string,
  sendOut: (bytes: Uint8Array) => void,
): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  relayInbox = [];
  relayReadResolver = null;
  relayClosed = false;
  relaySendOut = sendOut;

  await Promise.race([
    prover.setup(relayIo()),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`setupProverRelay timed out after ${SETUP_TIMEOUT_MS}ms for ${proverId}`),
          ),
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
  proxyUrl: string | undefined,
  request: HttpRequest,
): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  // Proxy mode: the WASM prover routes server traffic over the verifier
  // session mux internally and rejects a server_io. MPC mode: open a
  // websockify channel to the target server and pass it as server_io.
  const serverIo = proxyUrl ? await createIoChannel(proxyUrl) : undefined;
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
    await serverIo?.close();
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
 * Reveals data to the verifier, optionally with hash-committed ranges.
 * Returns the per-range openings (hash + blinder) for any hash commitments;
 * sent/recv are empty arrays when no commit was supplied.
 */
async function reveal(
  proverId: string,
  revealConfig: Reveal,
  commitConfig?: Commit,
): Promise<RevealOutput> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  return prover.reveal(revealConfig, commitConfig ?? null);
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
  commit: Commit | undefined;
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
    commit?: Commit;
    sent_ranges_with_handlers: RevealRangeWithHandler[];
    recv_ranges_with_handlers: RevealRangeWithHandler[];
  };

  return {
    sentRanges: typed.reveal.sent,
    recvRanges: typed.reveal.recv,
    sentRangesWithHandlers: typed.sent_ranges_with_handlers,
    recvRangesWithHandlers: typed.recv_ranges_with_handlers,
    commit: typed.commit as Commit | undefined,
  };
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
  setupProver,
  setupProverRelay,
  deliverToWasm,
  signalRelayClosed,
  sendRequest,
  getTranscript,
  computeReveal,
  reveal,
  freeProver,
});
