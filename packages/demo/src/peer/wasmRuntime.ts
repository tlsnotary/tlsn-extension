import * as Comlink from 'comlink';
import type { DataConnection } from 'peerjs';
import type { InitConfig, SelfTestConfig, SelfTestResult } from './wasm.worker';

export type { SelfTestConfig, SelfTestResult } from './wasm.worker';

// Thin singleton wrapper around the WASM worker. The worker exposes `init`,
// `getLogs`, and the `Prover`/`Verifier` classes (constructable over Comlink).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkerApi = any;

let workerApi: WorkerApi | null = null;
let initPromise: Promise<number> | null = null;

export function getWorkerApi(): WorkerApi {
  if (!workerApi) {
    const worker = new Worker(new URL('./wasm.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerApi = Comlink.wrap(worker);
  }
  return workerApi;
}

/** Initialize the WASM runtime once; returns the thread count in use. */
export function initWasmRuntime(config?: InitConfig): Promise<number> {
  if (!initPromise) {
    initPromise = getWorkerApi().init(config) as Promise<number>;
  }
  return initPromise;
}

export interface WasmRuntimeStatus {
  state: 'idle' | 'initializing' | 'ready' | 'error';
  threads?: number;
  isolated: boolean;
  error?: string;
}

/** Run an in-browser self-test proof (in-page Prover + Verifier over loopback). */
export function runSelfTest(
  cfg: SelfTestConfig,
  onProgress?: (message: string) => void,
): Promise<SelfTestResult> {
  const api = getWorkerApi();
  return api.selfTest(cfg, onProgress ? Comlink.proxy(onProgress) : undefined);
}

function toU8(d: unknown): Uint8Array {
  if (d instanceof Uint8Array) return d;
  return new Uint8Array(d as ArrayBufferLike);
}

// Bridge a PeerJS data channel to the worker's WASM session: inbound peer bytes
// → worker; the worker's outbound bytes (via the proxied callback) → peer.
function wireConn(conn: DataConnection): (bytes: Uint8Array) => void {
  const api = getWorkerApi();
  conn.on('data', (d) => api.deliverToWasm(toU8(d)));
  conn.on('close', () => api.signalPeerClosed());
  return Comlink.proxy((bytes: Uint8Array) => conn.send(bytes));
}

/** Run the MPC-TLS verifier over a PeerJS data channel; returns what it learned. */
export function runVerifierSession(
  cfg: { maxSentData?: number; maxRecvData?: number },
  conn: DataConnection,
  onProgress?: (message: string) => void,
): Promise<SelfTestResult> {
  const sendOut = wireConn(conn);
  return getWorkerApi().runVerifier(
    cfg,
    sendOut,
    onProgress ? Comlink.proxy(onProgress) : undefined,
  );
}

/** Run the MPC-TLS prover over a PeerJS data channel (verifier) + a TCP proxy. */
export function runProverSession(
  cfg: SelfTestConfig,
  conn: DataConnection,
  onProgress?: (message: string) => void,
): Promise<{ ms: number }> {
  const sendOut = wireConn(conn);
  return getWorkerApi().runProver(cfg, sendOut, onProgress ? Comlink.proxy(onProgress) : undefined);
}
