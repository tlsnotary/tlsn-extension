import { defineConfig, type Plugin } from 'vitest/config';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Vite plugin that serves the QuickJS WASM binary from the correct location.
 *
 * When Vite pre-bundles @jitl/quickjs-ng-wasmfile-release-sync, the JS is moved
 * to .vite/deps/ but the .wasm file stays in node_modules. The Emscripten loader
 * resolves the WASM URL relative to import.meta.url, so the fetch 404s.
 * This middleware intercepts those requests and serves the real file.
 */
function quickjsWasmPlugin(): Plugin {
  const wasmPath = path.resolve(
    __dirname,
    '../../node_modules/@jitl/quickjs-ng-wasmfile-release-sync/dist/emscripten-module.wasm',
  );

  return {
    name: 'quickjs-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes('emscripten-module.wasm')) {
          if (fs.existsSync(wasmPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            fs.createReadStream(wasmPath).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [quickjsWasmPlugin()],
  test: {
    globals: true,
    browser: {
      enabled: true,
      instances: [
        {
          browser: 'chromium',
        },
      ],
      provider: 'playwright',
      // Enable headless mode by default
      headless: true,
    },
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.config.ts', '**/*.config.js', '**/examples/**'],
    },
    include: ['src/**/*.browser.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'src/index.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
      process: 'process/browser',
      stream: 'stream-browserify',
      path: 'path-browserify',
      fs: path.resolve(__dirname, './src/node-fs-mock.js'),
      'fs/promises': path.resolve(__dirname, './src/node-fs-promises-mock.js'),
      crypto: path.resolve(__dirname, './src/node-crypto-mock.js'),
      events: 'events',
      util: 'util',
      'node:fs': path.resolve(__dirname, './src/node-fs-mock.js'),
      'node:fs/promises': path.resolve(__dirname, './src/node-fs-promises-mock.js'),
      'node:path': 'path-browserify',
      'node:stream': 'stream-browserify',
      'node:buffer': 'buffer',
      'node:crypto': path.resolve(__dirname, './src/node-crypto-mock.js'),
      'node:events': 'events',
      'node:util': 'util',
      cluster: path.resolve(__dirname, './src/empty-module.js'),
      url: path.resolve(__dirname, './src/empty-module.js'),
    },
  },
  define: {
    'process.env': {},
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
