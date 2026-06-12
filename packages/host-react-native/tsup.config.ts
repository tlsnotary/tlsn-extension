import { defineConfig } from 'tsup';
import { glob } from 'tinyglobby';

// Per-file transform (no bundling) for the React Native adapter.
//
// Metro is the bundler downstream — it does its own static analysis on
// `require('tlsn-native')` calls to pull native modules into the RN bundle.
// If we let esbuild bundle here, it wraps those calls in a `__require()`
// shim that Metro's analyzer can't see, so tlsn-native silently gets
// dropped from the RN bundle and blows up at runtime with
// "Requiring unknown module 'tlsn-native'".
//
// `bundle: false` makes esbuild emit one .js per .ts/.tsx, preserving
// the literal `require()` calls. Metro takes it from there.
export default defineConfig({
  entry: await glob(['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/*.d.ts']),
  format: ['esm'],
  bundle: false,
  experimentalDts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  outDir: 'dist',
});
