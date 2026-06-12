import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  // experimentalDts uses tsc directly (honors our tsconfig's bundler resolution)
  // instead of rollup-plugin-dts (which forces NodeNext rules and would require
  // .js suffixes in source — the whole thing we're trying to avoid).
  experimentalDts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'node',
  // Keep dependencies external — they get resolved at the consumer's install time.
  external: [
    '@tlsn/host-contracts',
    '@tlsn/plugin-sdk',
    '@clack/prompts',
    'commander',
    'playwright',
    'yaml',
  ],
});
