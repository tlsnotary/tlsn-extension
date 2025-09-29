import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Environment
    environment: 'happy-dom',

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Globals (optional - enables describe, it, expect without imports)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'build/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
      ],
    },

    // Test patterns
    include: ['tests/**/*.{test,spec}.{js,ts,tsx}'],
    exclude: ['node_modules', 'build', 'dist'],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});