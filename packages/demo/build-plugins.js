import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const plugins = ['twitter', 'swissbank', 'spotify', 'duolingo', 'discord_dm', 'discord_profile'];

// Build URLs from environment variables (matching config.ts pattern)
const VERIFIER_HOST = process.env.VITE_VERIFIER_HOST || 'localhost:7047';
const SSL = process.env.VITE_SSL === 'true';

const VERIFIER_URL = `${SSL ? 'https' : 'http'}://${VERIFIER_HOST}`;
const PROXY_URL = `${SSL ? 'wss' : 'ws'}://${VERIFIER_HOST}/proxy?token=`;

// Build each plugin separately as plain ES module
for (const plugin of plugins) {
    await build({
        configFile: false,
        build: {
            lib: {
                entry: path.resolve(__dirname, `src/plugins/${plugin}.plugin.ts`),
                formats: ['es'],
                fileName: () => `${plugin}.js`,
            },
            outDir: 'public/plugins',
            emptyOutDir: false,
            sourcemap: false,
            minify: false,
            rollupOptions: {
                output: {
                    exports: 'default',
                },
            },
        },
        define: {
            VITE_VERIFIER_URL: JSON.stringify(VERIFIER_URL),
            VITE_PROXY_URL: JSON.stringify(PROXY_URL),
        },
    });
    console.log(`✓ Built ${plugin}.js`);
}

console.log('✓ All plugins built successfully');
