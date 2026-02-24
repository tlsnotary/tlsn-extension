import * as Comlink from 'comlink';
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
  { pattern: /connecting to verifier/i, step: 'VERIFIER_CONNECTING', progress: 0.05, label: 'Connecting to verifier...' },
  { pattern: /setup complete/i, step: 'MPC_SETUP_COMPLETE', progress: 0.15, label: 'MPC setup complete' },
  { pattern: /connecting to server/i, step: 'SERVER_CONNECTING', progress: 0.25, label: 'Connecting to server...' },
  { pattern: /sending request/i, step: 'HTTP_SENDING', progress: 0.35, label: 'Sending request...' },
  { pattern: /response received/i, step: 'HTTP_RESPONSE_RECEIVED', progress: 0.5, label: 'Response received' },
  { pattern: /reveal\(\) called/i, step: 'PROOF_GENERATING', progress: 0.7, label: 'Generating proof...' },
  { pattern: /\bfinalized\b/i, step: 'PROOF_FINALIZED', progress: 0.9, label: 'Proof finalized' },
];

function interceptConsole(
  originalFn: (...args: any[]) => void,
): (...args: any[]) => void {
  return (...args: any[]) => {
    originalFn.apply(console, args);
    // Pattern-match against raw args (works even with %c formatting)
    const raw = args.map(String).join(' ');
    for (const { pattern, step, progress, label } of PROGRESS_PATTERNS) {
      if (pattern.test(raw)) {
        self.postMessage({ type: 'WASM_PROGRESS', step, progress, message: label });
        break;
      }
    }
  };
}

console.log = interceptConsole(console.log);
console.debug = interceptConsole(console.debug);
console.info = interceptConsole(console.info);

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
          ws.send(data);
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
      const err = new Error('WebSocket connection failed');
      error = err;
      if (!closed) reject(err);
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

    ws.onclose = (event) => {
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
 */
async function createProver(config: ProverConfig): Promise<string> {
  const prover = new Prover(config);
  const id = `prover-${nextProverId++}`;
  provers.set(id, prover);
  return id;
}

/**
 * Sets up the prover with the verifier via WebSocket URL.
 */
async function setupProver(
  proverId: string,
  verifierUrl: string,
): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  const verifierIo = await createIoChannel(verifierUrl);
  await prover.setup(verifierIo);
}

/**
 * Sends an HTTP request through the prover via WebSocket proxy URL.
 */
async function sendRequest(
  proverId: string,
  proxyUrl: string,
  request: HttpRequest,
): Promise<void> {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  const serverIo = await createIoChannel(proxyUrl);
  await prover.send_request(serverIo, request);
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
function computeReveal(
  proverId: string,
  handlers: any[],
): {
  sentRanges: any[];
  recvRanges: any[];
  sentRangesWithHandlers: any[];
  recvRangesWithHandlers: any[];
} {
  const prover = provers.get(proverId);
  if (!prover) throw new Error(`Prover not found: ${proverId}`);

  const transcript = prover.transcript();

  // Copy byte arrays since they may be WASM memory views that get invalidated
  const sent = new Uint8Array(transcript.sent);
  const recv = new Uint8Array(transcript.recv);

  // WASM returns snake_case fields from serde; map to camelCase for TS consumers
  const output = wasmComputeReveal(sent, recv, handlers) as {
    reveal: { sent: any[]; recv: any[] };
    sent_ranges_with_handlers: any[];
    recv_ranges_with_handlers: any[];
  };

  return {
    sentRanges: output.reveal.sent,
    recvRanges: output.reveal.recv,
    sentRangesWithHandlers: output.sent_ranges_with_handlers,
    recvRangesWithHandlers: output.recv_ranges_with_handlers,
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
      throw new Error(
        `Initialize failed: ${error}. Retry with null also failed: ${retryError}`,
      );
    }
  }
}

Comlink.expose({
  init,
  createProver,
  setupProver,
  sendRequest,
  getTranscript,
  computeReveal,
  reveal,
  freeProver,
});
