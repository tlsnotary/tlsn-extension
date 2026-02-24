/**
 * Worker thread initialization shim.
 *
 * Loaded via --import in every worker thread to provide Web Worker-like
 * globals (self, postMessage, close, Worker) on top of Node.js worker_threads.
 *
 * This is necessary because web-spawn's spawn.js expects Web Worker APIs.
 * The Worker polyfill must live here (not just on the main thread) because
 * the spawner worker creates sub-workers for rayon threads.
 */

import { parentPort, isMainThread, Worker as NodeWorker } from 'worker_threads';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// This file's own URL — used as --import for sub-workers.
const SELF_URL = import.meta.url;

// Polyfill fetch() for file:// URLs.
// The WASM glue's __wbg_init() calls fetch() to load the .wasm binary.
// Node.js fetch() does not support file:// URLs, so we intercept those.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const urlStr = url instanceof URL ? url.href : String(url);
  if (urlStr.startsWith('file://')) {
    const buffer = readFileSync(fileURLToPath(urlStr));
    const headers = {};
    if (urlStr.endsWith('.wasm')) {
      headers['Content-Type'] = 'application/wasm';
    }
    return new Response(buffer, { headers });
  }
  return originalFetch(url, init);
};

// Polyfill Web Worker constructor backed by Node.js worker_threads.
// web-spawn creates workers that load spawn.js as an ESM module.
// We bridge the Web Worker API (addEventListener, event.data) to Node.js API.
if (typeof globalThis.Worker === 'undefined') {
  globalThis.Worker = class WebWorkerCompat {
    #worker;
    #listeners = new Map();

    constructor(url, options = {}) {
      const urlStr = url instanceof URL ? url.href : String(url);

      // Handle data: URLs (used by wasm-bindgen for Atomics.wait helper workers).
      if (urlStr.startsWith('data:')) {
        const code = decodeURIComponent(urlStr.split(',')[1]);
        this.#worker = new NodeWorker(code, {
          eval: true,
          name: options.name,
        });
      } else {
        // Node.js worker_threads requires URL objects for file:// URLs.
        const workerUrl = urlStr.startsWith('file://') ? new URL(urlStr) : urlStr;

        // Regular module workers. Load this file (worker-init.mjs) first via
        // --import so that Web Worker globals are available before spawn.js.
        this.#worker = new NodeWorker(workerUrl, {
          execArgv: ['--import', SELF_URL],
          name: options.name,
        });
      }

      // Surface worker errors so they don't get silently swallowed.
      this.#worker.on('error', (err) => {
        console.error(`[Worker ${options.name ?? '?'}] Error:`, err);
      });
      this.#worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[Worker ${options.name ?? '?'}] Exited with code ${code}`);
        }
      });
    }

    postMessage(data) {
      this.#worker.postMessage(data);
    }

    addEventListener(type, handler) {
      // Web Workers wrap messages in { data: ... } event objects.
      const wrapper = (data) => handler({ data });
      this.#listeners.set(handler, wrapper);
      this.#worker.on(type, wrapper);
    }

    removeEventListener(type, handler) {
      const wrapper = this.#listeners.get(handler);
      if (wrapper) {
        this.#worker.off(type, wrapper);
        this.#listeners.delete(handler);
      }
    }

    terminate() {
      this.#worker.terminate();
    }
  };
}

if (!isMainThread && parentPort) {
  // Map of original handler -> wrapped handler for removeEventListener.
  const listenerMap = new WeakMap();

  // In browsers, `self` IS the global scope (DedicatedWorkerGlobalScope).
  // WASM bindings (e.g. web-time) access self.performance, self.crypto, etc.
  // We use a Proxy so any property not explicitly overridden falls through
  // to globalThis, matching browser behavior.
  const selfOverrides = {
    addEventListener(type, handler) {
      // Web Workers wrap messages in { data: ... } event objects.
      const wrapper = (data) => handler({ data });
      listenerMap.set(handler, wrapper);
      parentPort.on(type, wrapper);
    },
    removeEventListener(type, handler) {
      const wrapper = listenerMap.get(handler);
      if (wrapper) {
        parentPort.off(type, wrapper);
        listenerMap.delete(handler);
      }
    },
  };

  globalThis.self = new Proxy(selfOverrides, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return globalThis[prop];
    },
  });

  // Global postMessage / close (Web Worker API).
  globalThis.postMessage = (data) => parentPort.postMessage(data);
  globalThis.close = () => process.exit(0);
}
