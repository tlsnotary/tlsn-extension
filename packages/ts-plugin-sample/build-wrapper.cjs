#!/usr/bin/env node
/**
 * Build wrapper to create clean export default statement
 */
const fs = require('fs');
const { execSync } = require('child_process');

// Run esbuild
console.log('Building with esbuild...');
execSync('esbuild src/index.ts --bundle --format=esm --outfile=build/index.js --sourcemap --external:@sebastianwessel/quickjs --external:@jitl/quickjs-ng-wasmfile-release-sync --external:uuid --external:fast-deep-equal', {
  stdio: 'inherit'
});

// Read the generated code
let code = fs.readFileSync('build/index.js', 'utf8');

// Write back
fs.writeFileSync('build/index.js', code);

console.log('✓ Build complete: build/index.js');
