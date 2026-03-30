import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Get git hash from GIT_HASH env var (set by CI/Docker) or fallback to 'local'
const gitHash = process.env.GIT_HASH?.substring(0, 7) || 'local';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  server: {
    port: 8080,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor';
          }
          if (id.includes('node_modules/codemirror') || id.includes('node_modules/@codemirror/')) {
            return 'codemirror';
          }
        },
      },
    },
  },
});
