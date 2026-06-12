import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/index': 'src/components/index.ts',
    'logger/index': 'src/logger/index.ts',
    'style/index': 'src/style/index.ts',
    'util/index': 'src/util/index.ts',
  },
  format: ['esm'],
  experimentalDts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // Don't bundle peer/runtime deps — consumers resolve them.
  external: [
    '@tlsn/host-contracts',
    '@tlsn/plugin-sdk',
    '@react-native-cookies/cookies',
    'react',
    'react-native',
    'react-native-webview',
    'tlsn-native',
  ],
});
