import * as Comlink from 'comlink';
import type { DataConnection } from 'peerjs';
import { toUint8Array } from '@tlsn/common';
import type { InitConfig, VerifierResult } from './wasm.worker';

export type { VerifierResult } from './wasm.worker';

// Thin singleton wrapper around the WASM verifier worker. The worker exposes
// `init` and a `runVerifier` session bridged to a PeerJS data channel.

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

// Bridge a PeerJS data channel to the worker's WASM session: inbound peer bytes
// → worker; the worker's outbound bytes (via the proxied callback) → peer.
// String frames are out-of-band status (handled by the page), never MPC bytes.
// Returns a `cleanup` so the per-session handlers are removed when the session
// ends — without it a second proof would add a second handler and double-deliver.
function wireConn(conn: DataConnection): {
  sendOut: (bytes: Uint8Array) => void;
  cleanup: () => void;
} {
  const api = getWorkerApi();
  const onData = (d: unknown) => {
    if (typeof d === 'string') return;
    api.deliverToWasm(toUint8Array(d));
  };
  const onClose = () => api.signalPeerClosed();
  conn.on('data', onData);
  conn.on('close', onClose);
  return {
    sendOut: Comlink.proxy((bytes: Uint8Array) => conn.send(bytes)),
    cleanup: () => {
      conn.off('data', onData);
      conn.off('close', onClose);
    },
  };
}

/**
 * Run the MPC-TLS verifier over a PeerJS data channel; returns what it learned.
 * Safe to call repeatedly on the same channel — each run wires fresh handlers
 * and tears them down on completion, so sequential proofs don't accumulate.
 */
export function runVerifierSession(
  cfg: { maxSentData?: number; maxRecvData?: number; proxyBase?: string },
  conn: DataConnection,
  onProgress?: (message: string) => void,
): Promise<VerifierResult> {
  const { sendOut, cleanup } = wireConn(conn);
  return getWorkerApi()
    .runVerifier(cfg, sendOut, onProgress ? Comlink.proxy(onProgress) : undefined)
    .finally(cleanup);
}
