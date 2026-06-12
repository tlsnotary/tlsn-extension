import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'android', 'ios', '.expo'],
    // Mobile no longer ships its own test suite — those tests moved to
    // @tlsn/host-react-native with the extracted utilities. Allow the
    // run to pass when nothing matches.
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
