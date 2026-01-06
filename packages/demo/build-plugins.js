import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const plugins = ['twitter', 'swissbank', 'spotify'];

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
            VITE_VERIFIER_URL: JSON.stringify(
                process.env.VITE_VERIFIER_URL || 'http://localhost:7047'
            ),
            VITE_PROXY_URL: JSON.stringify(
                process.env.VITE_PROXY_URL || 'ws://localhost:7047/proxy?token='
            ),
        },
    });
    console.log(`✓ Built ${plugin}.js`);
}

console.log('✓ All plugins built successfully');
