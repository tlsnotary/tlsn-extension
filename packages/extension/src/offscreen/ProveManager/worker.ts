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
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';

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
  reveal,
  freeProver,
});
