#!/usr/bin/env node
/**
 * Build wrapper for TLSN plugins.
 *
 * Output filename is derived from the package.json "name" field
 * (scope stripped if present). Pass --watch for dev mode.
 */
const { execSync } = require('child_process');
const pkg = require('./package.json');

// Derive output filename from package name, stripping @scope/ if present
const pluginName = pkg.name.replace(/^@[^/]+\//, '');
const outfile = `build/${pluginName}.js`;

// Environment variables with defaults
const VERIFIER_URL = process.env.VERIFIER_URL || 'http://localhost:7047';
const PROXY_URL = process.env.PROXY_URL || 'ws://localhost:7047/proxy';

const watch = process.argv.includes('--watch') ? ' --watch' : '';

console.log('Building with esbuild...');
console.log(`  VERIFIER_URL: ${VERIFIER_URL}`);
console.log(`  PROXY_URL: ${PROXY_URL}`);
console.log(`  outfile: ${outfile}`);
execSync(`esbuild src/index.ts --bundle --format=esm --outfile=${outfile} --sourcemap --external:@sebastianwessel/quickjs --external:@jitl/quickjs-ng-wasmfile-release-sync --external:uuid --external:fast-deep-equal --define:__VERIFIER_URL__='"${VERIFIER_URL}"' --define:__PROXY_URL__='"${PROXY_URL}"'${watch}`, {
  stdio: 'inherit'
});

if (!watch) {
  console.log(`✓ Build complete: ${outfile}`);
}
