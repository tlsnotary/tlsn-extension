import { defineConfig, type Plugin } from 'vitest/config';
import path from 'node:path';
import fs from 'node:fs';

const wasmPkgDir = path.resolve(__dirname, '../tlsn-wasm-pkg');
const commonDistDir = path.resolve(__dirname, '../common/dist');
const pluginSdkSrc = path.resolve(__dirname, '../plugin-sdk/src');

/**
 * Vite plugin that serves the tlsn-wasm package directory as raw static files
 * under the /@tlsn-wasm/ URL prefix. This bypasses Vite's module transform
 * pipeline entirely — which is necessary because:
 *
 * 1. The WASM rayon thread pool creates Workers that load spawn.js
 * 2. Vite's transform injects HMR client code (/@vite/client) into served JS
 * 3. The HMR client accesses `document`/`window`, which don't exist in Workers
 * 4. This causes a silent crash, preventing the Worker from sending its ready message
 *
 * By serving all WASM pkg files raw, Workers load clean ES modules that work
 * in both main thread and Worker contexts.
 */
const testWorkerPath = path.resolve(__dirname, 'tests/browser/prove-worker.js');

/**
 * Serves raw static files under a URL prefix, bypassing Vite transforms.
 * This is necessary because Vite injects HMR client code (/@vite/client)
 * that references document/window, crashing Web Workers.
 */
function serveRaw(res: any, filePath: string) {
  const ext = path.extname(filePath);
  const contentType =
    ext === '.wasm'
      ? 'application/wasm'
      : ext === '.js'
        ? 'application/javascript'
        : 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  fs.createReadStream(filePath).pipe(res);
}

function tlsnWasmPlugin(): Plugin {
  const wasmPrefix = '/@tlsn-wasm/';
  const commonPrefix = '/@tlsn-common/';
  const testWorkerUrl = '/@test/prove-worker.js';

  return {
    name: 'tlsn-wasm-serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        const url = req.url.split('?')[0];

        // Serve the test Worker script raw (no Vite transforms)
        if (url === testWorkerUrl) {
          serveRaw(res, testWorkerPath);
          return;
        }

        // Serve WASM pkg files raw
        if (url.startsWith(wasmPrefix)) {
          const filePath = path.join(wasmPkgDir, decodeURIComponent(url.slice(wasmPrefix.length)));
          if (fs.existsSync(filePath)) { serveRaw(res, filePath); return; }
        }

        // Serve @tlsn/common dist files raw
        if (url.startsWith(commonPrefix)) {
          const filePath = path.join(commonDistDir, decodeURIComponent(url.slice(commonPrefix.length)));
          if (fs.existsSync(filePath)) { serveRaw(res, filePath); return; }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tlsnWasmPlugin()],

  test: {
    globals: true,
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [
        {
          browser: 'chromium',
          ...(process.env.CHROME_PATH
            ? { launch: { executablePath: process.env.CHROME_PATH } }
            : {}),
        },
      ],
      headless: true,
    },
    include: ['tests/browser/**/*.browser.{test,spec}.ts'],
    testTimeout: 180_000,
    hookTimeout: 120_000,
    globalSetup: ['./tests/browser/globalSetup.ts'],
  },

  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: [wasmPkgDir, pluginSdkSrc, '.'],
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
      process: 'process/browser',
      stream: 'stream-browserify',
      path: 'path-browserify',
      fs: path.resolve(pluginSdkSrc, 'node-fs-mock.js'),
      crypto: path.resolve(pluginSdkSrc, 'node-crypto-mock.js'),
      events: 'events',
      util: 'util',
      // NOTE: Do NOT alias node:-prefixed modules here. globalSetup.ts runs
      // in Node.js via vite-node and uses `import fs from 'node:fs'` etc.
      cluster: path.resolve(pluginSdkSrc, 'empty-module.js'),
      url: path.resolve(pluginSdkSrc, 'empty-module.js'),
    },
  },

  define: {
    // NOTE: Do NOT define 'process.env' here — it would replace process.env
    // with {} in globalSetup.ts (which runs via vite-node), breaking env var reads.
    global: 'globalThis',
  },

  optimizeDeps: {
    include: ['buffer', 'process'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
});
