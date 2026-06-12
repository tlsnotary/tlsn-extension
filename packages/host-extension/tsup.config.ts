import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'background/index': 'src/background/index.ts',
    'content/index': 'src/content/index.ts',
    'offscreen/index': 'src/offscreen/index.ts',
    'types/index': 'src/types/index.ts',
    'util/index': 'src/util/index.ts',
    // Web Worker as its own entry. Tsup inlines ProveManager into
    // `dist/offscreen/index.js`, so the runtime `new Worker(new URL('./worker.js',
    // import.meta.url))` resolves relative to *that* file — meaning the worker
    // output must live at `dist/offscreen/worker.js` to match. (esbuild doesn't
    // rewrite Worker URLs the way Vite does — the `.js` here is a runtime
    // filename reference, not a TS-source import.)
    'offscreen/worker': 'src/offscreen/ProveManager/worker.ts',
  },
  format: ['esm'],
  experimentalDts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: [
    '@tlsn/host-contracts',
    '@tlsn/plugin-sdk',
    '@tlsn/common',
    'comlink',
    'tlsn-wasm',
    'uuid',
    'webextension-polyfill',
  ],
});
