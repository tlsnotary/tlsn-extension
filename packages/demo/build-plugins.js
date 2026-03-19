#!/usr/bin/env node
/**
 * Build all demo plugins with esbuild.
 *
 * Reads VITE_VERIFIER_HOST and VITE_SSL from environment (or .env defaults)
 * and injects __VERIFIER_URL__ / __PROXY_URL__ at build time.
 *
 * Pass --watch to enable watch mode (rebuilds on file changes).
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const plugins = ['twitter', 'swissbank', 'spotify', 'duolingo', 'uber', 'discord_dm', 'discord_profile'];

// Build URLs from environment variables (matching .env / .env.production)
const VERIFIER_HOST = process.env.VITE_VERIFIER_HOST || 'localhost:7047';
const SSL = process.env.VITE_SSL === 'true';

const VERIFIER_URL = `${SSL ? 'https' : 'http'}://${VERIFIER_HOST}`;
const PROXY_URL = `${SSL ? 'wss' : 'ws'}://${VERIFIER_HOST}/proxy?token=`;

console.log('Building plugins with esbuild...');
console.log(`  VERIFIER_URL: ${VERIFIER_URL}`);
console.log(`  PROXY_URL: ${PROXY_URL}`);

const entryPoints = Object.fromEntries(
  plugins.map((p) => [p, path.resolve(__dirname, `plugins/${p}.plugin.ts`)]),
);

const ctx = await esbuild.context({
  entryPoints,
  bundle: true,
  format: 'esm',
  outdir: path.resolve(__dirname, 'public/plugins'),
  define: {
    __VERIFIER_URL__: JSON.stringify(VERIFIER_URL),
    __PROXY_URL__: JSON.stringify(PROXY_URL),
  },
  plugins: [
    {
      name: 'log-rebuild',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            console.log(`✓ All plugins built successfully`);
          }
        });
      },
    },
  ],
});

await ctx.rebuild();

if (watch) {
  await ctx.watch();
  console.log('Watching for plugin changes...');
} else {
  await ctx.dispose();
}
