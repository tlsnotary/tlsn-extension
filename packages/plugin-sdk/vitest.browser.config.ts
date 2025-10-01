import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
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
      'buffer': 'buffer',
      'process': 'process/browser',
      'stream': 'stream-browserify',
      'path': 'path-browserify',
      'fs': path.resolve(__dirname, './src/node-fs-mock.js'),
      'crypto': path.resolve(__dirname, './src/node-crypto-mock.js'),
      'node:fs': path.resolve(__dirname, './src/node-fs-mock.js'),
      'node:path': 'path-browserify',
      'node:stream': 'stream-browserify',
      'node:buffer': 'buffer',
      'node:crypto': path.resolve(__dirname, './src/node-crypto-mock.js'),
      'cluster': path.resolve(__dirname, './src/empty-module.js'),
      'url': path.resolve(__dirname, './src/empty-module.js'),
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