#!/usr/bin/env node
/**
 * Build wrapper to create clean export default statement
 */
const fs = require('fs');
const { execSync } = require('child_process');

// Environment variables with defaults
const VERIFIER_URL = process.env.VERIFIER_URL || 'http://localhost:7047';
const PROXY_URL = process.env.PROXY_URL || 'ws://localhost:7047/proxy';

// Run esbuild
console.log('Building with esbuild...');
console.log(`  VERIFIER_URL: ${VERIFIER_URL}`);
console.log(`  PROXY_URL: ${PROXY_URL}`);
execSync(`esbuild src/index.ts --bundle --format=esm --outfile=build/index.js --sourcemap --external:@sebastianwessel/quickjs --external:@jitl/quickjs-ng-wasmfile-release-sync --external:uuid --external:fast-deep-equal --define:__VERIFIER_URL__='"${VERIFIER_URL}"' --define:__PROXY_URL__='"${PROXY_URL}"'`, {
  stdio: 'inherit'
});

// Read the generated code
let code = fs.readFileSync('build/index.js', 'utf8');

// Write back
fs.writeFileSync('build/index.js', code);

console.log('✓ Build complete: build/index.js');
