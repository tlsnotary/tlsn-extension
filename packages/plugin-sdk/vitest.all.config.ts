import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace config that combines Node and browser test suites.
 * Used by `test:coverage:all` to produce a single merged coverage report
 * covering both the pure Node-tested logic and the QuickJS browser-tested paths.
 */
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: { name: 'unit' },
  },
  {
    extends: './vitest.browser.config.ts',
    test: { name: 'browser' },
  },
]);
