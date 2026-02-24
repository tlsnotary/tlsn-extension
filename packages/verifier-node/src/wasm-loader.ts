/**
 * WASM loader for Node.js.
 *
 * Loads the tlsn-wasm module (built with `--target web`) in Node.js by:
 * 1. Polyfilling Web Worker APIs on top of Node.js worker_threads
 * 2. Reading the WASM binary from disk
 * 3. Calling initSync() to avoid fetch/import.meta.url usage
 * 4. Calling initialize() to set up rayon thread pool (needed for MPC)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WASM_PKG_DIR = join(__dirname, '..', '..', 'tlsn-wasm-pkg');

// ============================================================================
// Polyfill browser globals BEFORE importing the WASM JS glue.
// ============================================================================

// Load worker-init.mjs to get fetch polyfill + Worker polyfill on main thread.
// In worker threads this runs via --import; on the main thread we import it here.
await import('./worker-init.mjs');

// spawn.js has side effects calling self.addEventListener('message', ...) at
// import time. On the main thread, these listeners are never triggered — they
// only matter inside worker threads (where worker-init.mjs provides the real
// polyfill). We use a Proxy that stubs addEventListener/removeEventListener
// but delegates everything else (performance, crypto, etc.) to globalThis,
// matching browser behavior where self === globalThis on the main thread.
if (typeof globalThis.self === 'undefined') {
  const mainThreadOverrides: Record<string, unknown> = {
    addEventListener: () => {},
    removeEventListener: () => {},
    postMessage: () => {},
  };
  (globalThis as any).self = new Proxy(mainThreadOverrides, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (globalThis as any)[prop];
    },
  });
}

// ============================================================================

const THREAD_COUNT = Math.max(1, (await import('os')).cpus().length - 1);

/**
 * Loads the WASM module and returns the Verifier class.
 */
export async function loadWasm() {
  // Read WASM binary from disk.
  const wasmPath = join(WASM_PKG_DIR, 'tlsn_wasm_bg.wasm');
  const wasmBytes = readFileSync(wasmPath);

  // Create shared memory (required because WASM was compiled with atomics).
  const memory = new WebAssembly.Memory({
    initial: 226,
    maximum: 65536,
    shared: true,
  });

  // Dynamic import to ensure polyfills are set up first.
  const wasmModule = await import(join(WASM_PKG_DIR, 'tlsn_wasm.js'));
  const { initSync, initialize, Verifier } = wasmModule;

  // Initialize WASM synchronously — bypasses fetch() and import.meta.url.
  initSync({ module: wasmBytes, memory });

  // Initialize the thread pool (rayon + web-spawn).
  // This is required because the MPC-TLS protocol uses parallel computation.
  console.log(`Initializing WASM thread pool (${THREAD_COUNT} threads)...`);
  await initialize(undefined, THREAD_COUNT);

  return { Verifier };
}
