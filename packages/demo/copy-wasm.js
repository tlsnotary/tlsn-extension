// Copy the tlsn-wasm package into public/ so it is served as static files with
// its `snippets/` layout intact. The WASM glue and its rayon thread-spawner use
// `new URL('./spawn.js', import.meta.url)` and `import('../../../tlsn_wasm.js')`
// internally; bundling them breaks those relative paths, so we load the package
// from a static URL instead (see src/peer/wasm.worker.ts).
import { cpSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const src = dirname(require.resolve('tlsn-wasm/package.json'));
const dest = resolve(import.meta.dirname, 'public', 'tlsn-wasm');

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

console.log(`[copy-wasm] ${src} → ${dest}`);
