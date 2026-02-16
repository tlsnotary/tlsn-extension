import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Vite plugin that serves the QuickJS WASM binary from the correct monorepo path.
 * Reused from vitest.browser.config.ts.
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
  root: __dirname,
  server: {
    port: 3001,
    open: '/todo.html',
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
