#!/usr/bin/env node
/**
 * Build wrapper to create clean export default statement
 */
const fs = require('fs');
const { execSync } = require('child_process');

// Run esbuild
console.log('Building with esbuild...');
execSync('esbuild src/index.ts --bundle --format=esm --outfile=build/index.js --sourcemap', {
  stdio: 'inherit'
});

// Read the generated code
let code = fs.readFileSync('build/index.js', 'utf8');

// Transform to inline export default
// From: var index_default = { ... }; export { index_default as default };
// To:   export default { ... };
code = code.replace(
  /var index_default = (\{[\s\S]*?\});[\s\n]*export \{\s*index_default as default\s*\};/,
  'export default $1;'
);

// Write back
fs.writeFileSync('build/index.js', code);

console.log('✓ Build complete: build/index.js');
