import * as Comlink from 'comlink';
import type * as TlsnWasm from 'tlsn-wasm';
import type { LoggingLevel, CrateLogFilter, VerifierConfig } from 'tlsn-wasm';

// Runs the TLSNotary WASM verifier in a dedicated worker. The glue is loaded
// from a static path (copied to /public by copy-wasm.js) rather than bundled, so
// the rayon thread-spawner's internal `new URL('./spawn.js', import.meta.url)`
// and `import('../../../tlsn_wasm.js')` resolve identically in dev and production.

let wasm: typeof TlsnWasm | null = null;
let threadCount = 0;

async function loadWasm(): Promise<typeof TlsnWasm> {
  if (wasm) return wasm;
  // Fully-qualified URL so the dev server treats it as external and serves the
  // static /public file as-is (no `?import` transform); the file is shipped
  // unbundled so the rayon thread-spawner's relative imports resolve.
  const glueUrl = new URL('/tlsn-wasm/tlsn_wasm.js', self.location.origin).href;
  const mod = (await import(/* @vite-ignore */ glueUrl)) as unknown as typeof TlsnWasm;
  await mod.default();
  wasm = mod;
  return mod;
}

// ---- IoChannel: the byte-stream contract the WASM expects ----

interface IoChannel {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

// Async byte queue: resolves a pending read as soon as a chunk arrives; returns
// null once closed and drained (EOF).
class ByteQueue {
  private chunks: Uint8Array[] = [];
  private resolver: ((value: Uint8Array | null) => void) | null = null;
  private closed = false;

  push(data: Uint8Array): void {
    if (this.closed) return;
    if (this.resolver) {
      const resolve = this.resolver;
      this.resolver = null;
      resolve(data);
    } else {
      this.chunks.push(data);
    }
  }

  read(): Promise<Uint8Array | null> {
    if (this.chunks.length > 0) return Promise.resolve(this.chunks.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  close(): void {
    this.closed = true;
    if (this.resolver) {
      const resolve = this.resolver;
      this.resolver = null;
      resolve(null);
    }
  }
}

// ---- Public API (exposed over Comlink) ----

export interface InitConfig {
  loggingLevel?: LoggingLevel;
  hardwareConcurrency?: number;
  crateFilters?: CrateLogFilter[];
}

async function init(config?: InitConfig): Promise<number> {
  const {
    loggingLevel = 'Info',
    hardwareConcurrency = navigator.hardwareConcurrency,
    crateFilters,
  } = config || {};
  const w = await loadWasm();
  try {
    await w.initialize(
      { level: loggingLevel, crate_filters: crateFilters, span_events: undefined },
      hardwareConcurrency,
    );
    threadCount = hardwareConcurrency;
  } catch (err) {
    console.log('Multi-threaded init failed, falling back to single thread: ' + String(err));
    await w.initialize(undefined, 1);
    threadCount = 1;
  }
  return threadCount;
}

export interface VerifierResult {
  serverName?: string;
  sent: string;
  recv: string;
  threads: number;
  ms: number;
}

// Redacted/unauthenticated bytes come back as NUL; show them as a block.
function decodeTranscript(arr?: number[]): string {
  return new TextDecoder()
    .decode(new Uint8Array(arr || []))
    .split(' ')
    .join('█');
}

// ---- Live session over an external transport (e.g. a PeerJS data channel) ----
//
// WebRTC can't run inside a worker, so the data channel lives on the main
// thread. Incoming peer bytes are pushed in via deliverToWasm(); outgoing bytes
// are handed to the main thread through the `sendOut` callback. One session per
// worker (each browser runs a single party).

let sessionInbox: ByteQueue | null = null;
let sessionSendOut: ((bytes: Uint8Array) => void) | null = null;

function peerIo(): IoChannel {
  const inbox = sessionInbox!;
  return {
    read: () => inbox.read(),
    write: (d) => {
      // Copy off (possibly shared) WASM memory before handing to the main thread.
      sessionSendOut?.(d.slice());
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  };
}

function deliverToWasm(bytes: Uint8Array): void {
  sessionInbox?.push(bytes);
}

function signalPeerClosed(): void {
  sessionInbox?.close();
}

const progressLogger = (onProgress?: (m: string) => void) => (m: string) => {
  try {
    onProgress?.(m);
  } catch {
    /* progress sink closed */
  }
};

// Verifier side: runs the MPC-TLS verifier over the peer transport and returns
// what it independently learned.
async function runVerifier(
  cfg: { maxSentData?: number; maxRecvData?: number },
  sendOut: (bytes: Uint8Array) => void,
  onProgress?: (m: string) => void,
): Promise<VerifierResult> {
  const w = await loadWasm();
  sessionInbox = new ByteQueue();
  sessionSendOut = sendOut;
  const log = progressLogger(onProgress);
  const verifier = new w.Verifier({
    max_sent_data: cfg.maxSentData ?? 2048,
    max_recv_data: cfg.maxRecvData ?? 4096,
  } as VerifierConfig);
  const io = peerIo() as unknown as Parameters<typeof verifier.connect>[0];
  const t0 = performance.now();
  log('Connecting to prover…');
  await verifier.connect(io);
  log('MPC setup…');
  await verifier.setup();
  log('Running protocol…');
  await verifier.run();
  log('Verifying…');
  const output = await verifier.verify();
  return {
    serverName: output.server_name,
    sent: decodeTranscript(output.transcript?.sent),
    recv: decodeTranscript(output.transcript?.recv),
    threads: threadCount,
    ms: performance.now() - t0,
  };
}

Comlink.expose({
  init,
  runVerifier,
  deliverToWasm,
  signalPeerClosed,
});
