#!/usr/bin/env node
/**
 * Build all demo plugins with esbuild.
 *
 * Reads VITE_VERIFIER_HOST and VITE_SSL from environment (or .env defaults)
 * and injects __VERIFIER_URL__ / __PROXY_URL__ at build time.
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const plugins = ['twitter', 'swissbank', 'spotify', 'duolingo', 'discord_dm', 'discord_profile'];

// Build URLs from environment variables (matching .env / .env.production)
const VERIFIER_HOST = process.env.VITE_VERIFIER_HOST || 'localhost:7047';
const SSL = process.env.VITE_SSL === 'true';

const VERIFIER_URL = `${SSL ? 'https' : 'http'}://${VERIFIER_HOST}`;
const PROXY_URL = `${SSL ? 'wss' : 'ws'}://${VERIFIER_HOST}/proxy?token=`;

console.log('Building plugins with esbuild...');
console.log(`  VERIFIER_URL: ${VERIFIER_URL}`);
console.log(`  PROXY_URL: ${PROXY_URL}`);

for (const plugin of plugins) {
  const entry = path.resolve(__dirname, `plugins/${plugin}.plugin.ts`);
  const outfile = path.resolve(__dirname, `public/plugins/${plugin}.js`);

  execSync(
    `esbuild ${entry} --bundle --format=esm --outfile=${outfile}` +
      ` --define:__VERIFIER_URL__='"${VERIFIER_URL}"'` +
      ` --define:__PROXY_URL__='"${PROXY_URL}"'`,
    { stdio: 'inherit' },
  );
  console.log(`  ✓ ${plugin}.js`);
}

console.log('✓ All plugins built successfully');
