import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// Get git commit hash at build time
const getGitCommitHash = () => {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
        return 'unknown';
    }
};

export default defineConfig({
    define: {
        __GIT_COMMIT_HASH__: JSON.stringify(getGitCommitHash()),
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
