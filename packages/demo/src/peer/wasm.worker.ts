import * as Comlink from 'comlink';
import type * as TlsnWasm from 'tlsn-wasm';
import type {
  LoggingLevel,
  CrateLogFilter,
  HttpRequest,
  ProverConfig,
  VerifierConfig,
} from 'tlsn-wasm';

// Runs the TLSNotary WASM in a dedicated worker. The glue is loaded from a
// static path (copied to /public by copy-wasm.js) rather than bundled, so the
// rayon thread-spawner's internal `new URL('./spawn.js', import.meta.url)` and
// `import('../../../tlsn_wasm.js')` resolve identically in dev and production.

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

// In-memory duplex pair: bytes written to side A are read on side B and vice
// versa. Used to connect an in-page Prover and Verifier for the self-test.
function makeLoopbackPair(): { a: IoChannel; b: IoChannel } {
  const a2b = new ByteQueue();
  const b2a = new ByteQueue();
  const a: IoChannel = {
    read: () => b2a.read(),
    write: (d) => {
      a2b.push(d.slice());
      return Promise.resolve();
    },
    close: () => {
      a2b.close();
      return Promise.resolve();
    },
  };
  const b: IoChannel = {
    read: () => a2b.read(),
    write: (d) => {
      b2a.push(d.slice());
      return Promise.resolve();
    },
    close: () => {
      b2a.close();
      return Promise.resolve();
    },
  };
  return { a, b };
}

// IoChannel over a WebSocket (the prover↔server connection, via a TCP proxy).
function createWsIo(url: string): Promise<IoChannel> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const queue = new ByteQueue();
    ws.onopen = () =>
      resolve({
        read: () => queue.read(),
        write: (d) => {
          // Copy off (possibly shared) WASM memory into a plain ArrayBuffer.
          const copy = new Uint8Array(d.length);
          copy.set(d);
          ws.send(copy);
          return Promise.resolve();
        },
        close: () => {
          ws.close();
          return Promise.resolve();
        },
      });
    ws.onmessage = (e) => queue.push(new Uint8Array(e.data as ArrayBuffer));
    ws.onerror = () => reject(new Error('proxy websocket failed: ' + url));
    ws.onclose = () => queue.close();
  });
}

// ---- Logging ----

const logBuffer: string[] = [];
const origLog = console.log;
console.log = (...args: unknown[]) => {
  logBuffer.push(args.join(' '));
  origLog.apply(console, args);
};

function getLogs(): string[] {
  const logs = [...logBuffer];
  logBuffer.length = 0;
  return logs;
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

export interface SelfTestConfig {
  proxyUrl: string;
  serverName: string;
  path: string;
  authToken?: string;
  maxSentData?: number;
  maxRecvData?: number;
}

export interface SelfTestResult {
  serverName?: string;
  sent: string;
  recv: string;
  threads: number;
  ms: number;
}

// Runs a complete in-browser proof: an in-page Prover and Verifier perform the
// MPC-TLS protocol over a loopback channel, with the Prover reaching the target
// server through a TCP proxy. Returns what the Verifier independently learned.
async function selfTest(
  cfg: SelfTestConfig,
  onProgress?: (message: string) => void,
): Promise<SelfTestResult> {
  const w = await loadWasm();
  const enc = new TextEncoder();
  const maxSent = cfg.maxSentData ?? 2048;
  const maxRecv = cfg.maxRecvData ?? 4096;
  const log = (m: string) => {
    try {
      onProgress?.(m);
    } catch {
      /* progress sink closed */
    }
  };

  const { a, b } = makeLoopbackPair();

  const prover = new w.Prover({
    server_name: cfg.serverName,
    mode: 'Mpc',
    max_sent_data: maxSent,
    max_recv_data: maxRecv,
    network: 'Latency',
  } as ProverConfig);
  const verifier = new w.Verifier({
    max_sent_data: maxSent,
    max_recv_data: maxRecv,
  } as VerifierConfig);

  const headers = new Map<string, number[]>();
  headers.set('host', [...enc.encode(cfg.serverName)]);
  headers.set('connection', [...enc.encode('close')]);
  if (cfg.authToken) headers.set('authorization', [...enc.encode('Bearer ' + cfg.authToken)]);

  const request = { uri: cfg.path, method: 'GET', headers } as HttpRequest;

  const t0 = performance.now();

  const verifierFlow = (async () => {
    log('Verifier: connecting to prover…');
    await verifier.connect(b as unknown as Parameters<typeof verifier.connect>[0]);
    log('Verifier: MPC setup…');
    await verifier.setup();
    log('Verifier: running protocol…');
    await verifier.run();
    log('Verifier: verifying…');
    return verifier.verify();
  })();

  const proverFlow = (async () => {
    log('Prover: MPC setup…');
    await prover.setup(a as unknown as Parameters<typeof prover.setup>[0]);
    log('Prover: connecting to server via proxy…');
    const serverIo = await createWsIo(cfg.proxyUrl);
    log('Prover: sending request…');
    await prover.send_request(
      serverIo as unknown as Parameters<typeof prover.send_request>[0],
      request,
    );
    const transcript = prover.transcript();
    log('Prover: revealing transcript…');
    await prover.reveal({
      sent: [{ start: 0, end: transcript.sent.length }],
      recv: [{ start: 0, end: transcript.recv.length }],
      server_identity: true,
    });
  })();

  const [output] = await Promise.all([verifierFlow, proverFlow]);
  const ms = performance.now() - t0;

  const decode = (arr?: number[]) =>
    new TextDecoder()
      .decode(new Uint8Array(arr || []))
      .split('\u0000')
      .join('\u2588');

  return {
    serverName: output.server_name,
    sent: decode(output.transcript?.sent),
    recv: decode(output.transcript?.recv),
    threads: threadCount,
    ms,
  };
}

// Redacted/unauthenticated bytes come back as NUL; show them as a block.
function decodeTranscript(arr?: number[]): string {
  return new TextDecoder()
    .decode(new Uint8Array(arr || []))
    .split(' ')
    .join('█');
}

function buildRequest(cfg: SelfTestConfig): HttpRequest {
  const enc = new TextEncoder();
  const headers = new Map<string, number[]>();
  headers.set('host', [...enc.encode(cfg.serverName)]);
  headers.set('connection', [...enc.encode('close')]);
  if (cfg.authToken) headers.set('authorization', [...enc.encode('Bearer ' + cfg.authToken)]);
  return { uri: cfg.path, method: 'GET', headers } as HttpRequest;
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
): Promise<SelfTestResult> {
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

// Prover side: runs the MPC-TLS prover over the peer transport (to the verifier)
// and a WebSocket proxy (to the target server).
async function runProver(
  cfg: SelfTestConfig,
  sendOut: (bytes: Uint8Array) => void,
  onProgress?: (m: string) => void,
): Promise<{ ms: number }> {
  const w = await loadWasm();
  sessionInbox = new ByteQueue();
  sessionSendOut = sendOut;
  const log = progressLogger(onProgress);
  const prover = new w.Prover({
    server_name: cfg.serverName,
    mode: 'Mpc',
    max_sent_data: cfg.maxSentData ?? 2048,
    max_recv_data: cfg.maxRecvData ?? 4096,
    network: 'Latency',
  } as ProverConfig);
  const io = peerIo() as unknown as Parameters<typeof prover.setup>[0];
  const t0 = performance.now();
  log('MPC setup with verifier…');
  await prover.setup(io);
  log('Connecting to server via proxy…');
  const serverIo = await createWsIo(cfg.proxyUrl);
  log('Sending request…');
  await prover.send_request(
    serverIo as unknown as Parameters<typeof prover.send_request>[0],
    buildRequest(cfg),
  );
  const transcript = prover.transcript();
  log('Revealing transcript…');
  await prover.reveal({
    sent: [{ start: 0, end: transcript.sent.length }],
    recv: [{ start: 0, end: transcript.recv.length }],
    server_identity: true,
  });
  return { ms: performance.now() - t0 };
}

Comlink.expose({
  init,
  getLogs,
  selfTest,
  runVerifier,
  runProver,
  deliverToWasm,
  signalPeerClosed,
});
