import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Get git commit hash from GIT_HASH env var (set by CI/Docker) or fallback to 'local'
const gitHash = process.env.GIT_HASH || 'local';

export default defineConfig({
    define: {
        __GIT_COMMIT_HASH__: JSON.stringify(gitHash),
    },
    plugins: [react()],
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
    server: {
        port: 3000,
        open: true,
        headers: {
            'Cache-Control': 'no-store',
        },
    },
});
