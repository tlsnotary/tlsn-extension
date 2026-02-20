#!/usr/bin/env node
/**
 * Build demo plugins via the shared @tlsn/plugins package,
 * then copy the output to public/plugins/.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../..');

// Forward env variables and build shared plugins for demo target
execSync('npm run build:demo --workspace=@tlsn/plugins', {
  stdio: 'inherit',
  env: process.env,
  cwd: monorepoRoot,
});

// Copy built plugins to public/plugins/
const sourceDir = path.resolve(__dirname, '../plugins/dist/demo');
const targetDir = path.resolve(__dirname, 'public/plugins');
fs.mkdirSync(targetDir, { recursive: true });

const plugins = ['twitter', 'swissbank', 'spotify', 'duolingo'];
for (const plugin of plugins) {
  fs.copyFileSync(
    path.join(sourceDir, `${plugin}.js`),
    path.join(targetDir, `${plugin}.js`),
  );
  console.log(`  Copied ${plugin}.js`);
}

console.log('Demo plugins ready');
