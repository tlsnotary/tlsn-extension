import { defineConfig } from 'vite';
import path from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      outDir: 'dist',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
    }),
  ],
  build: {
    target: 'es2020',
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        styles: path.resolve(__dirname, 'src/styles.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Externalize QuickJS and Node.js dependencies
      external: [
        '@sebastianwessel/quickjs',
        '@jitl/quickjs-ng-wasmfile-release-sync',
        /^node:.*/,
        '@tlsn/common',
      ],
      output: {
        exports: 'named',
      },
    },
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
