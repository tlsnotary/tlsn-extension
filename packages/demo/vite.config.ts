import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Get git commit hash from GIT_HASH env var (set by CI/Docker) or fallback to 'local'
const gitHash = process.env.GIT_HASH || 'local';

// Only the VERIFIER side of the peer-to-peer page runs the WASM verifier, which
// needs SharedArrayBuffer → cross-origin isolation. The verifier is opened via a
// `?j=<peerId>` link; isolate only that document. The prover side (no query)
// must NOT be isolated — it relies on the extension's injected `window.tlsn`,
// which COEP would block. The main demo page is never isolated either.
function crossOriginIsolatePeer(): Plugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apply = (req: any, res: any, next: any) => {
    const url = req.url || '';
    const path = url.split('?')[0];
    const isVerifierDoc = (path === '/peer.html' || path === '/peer') && url.includes('j=');
    // Make every same-origin asset embeddable inside the isolated verifier.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // COEP on assets/workers (so they load inside the isolated verifier) and on
    // the verifier document itself — but never on the bare prover/main documents.
    if (path !== '/' && path !== '/index.html' && path !== '/peer.html' && path !== '/peer') {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    if (isVerifierDoc) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    next();
  };
  return {
    name: 'coi-peer',
    configureServer(server) {
      server.middlewares.use(apply);
    },
    configurePreviewServer(server) {
      server.middlewares.use(apply);
    },
  };
}

export default defineConfig({
  define: {
    __GIT_COMMIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [react(), crossOriginIsolatePeer()],
  // tlsn-wasm ships its own .wasm + nested worker via `new URL(..., import.meta.url)`;
  // excluding it from dep-optimization keeps those asset URLs intact.
  optimizeDeps: { exclude: ['tlsn-wasm'] },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Don't inline assets/workers as data: URLs — tlsn-wasm's rayon thread
    // spawner uses `new URL('./spawn.js', import.meta.url)` internally, which
    // breaks when the worker is inlined as a data: URL.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        peer: resolve(import.meta.dirname, 'peer.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
});
