import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// Get git hash for footer display
const getGitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_HASH__: JSON.stringify(getGitHash()),
  },
  server: {
    port: 8080,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          codemirror: ['codemirror', '@codemirror/lang-javascript', '@codemirror/state', '@codemirror/view'],
        },
      },
    },
  },
});
