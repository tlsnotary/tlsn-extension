import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig(
  // Global ignores
  {
    ignores: [
      '**/build/',
      '**/dist/',
      'packages/extension/lib/',
      'packages/extension/webpack.config.js',
      'packages/demo/public/',
      'packages/ts-plugin-sample/',
      'packages/tlsn-wasm-pkg/',
    ],
  },

  // Base config for all JS/TS files
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettier,

  // Shared settings for all files
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Test file overrides
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Files where console is intentional (scripts, logger, workers, test infra)
  {
    files: [
      'packages/common/src/logger/**',
      'packages/extension/src/offscreen/ProveManager/worker.ts',
      'packages/extension/tests/browser/globalSetup.ts',
      'packages/verifier/scripts/**',
      'packages/demo/**',
      'packages/tutorial/**',
      '**/*.js',
      '**/*.mjs',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // Extension-specific overrides
  {
    files: ['packages/extension/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.webextensions,
        URLPattern: 'readonly',
      },
    },
  },

  // CJS build scripts
  {
    files: ['packages/extension/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Plugin overrides — sandbox-injected globals
  {
    files: ['packages/demo/plugins/**/*.ts', 'packages/tutorial/*.js'],
    languageOptions: {
      globals: {
        div: 'readonly',
        button: 'readonly',
        input: 'readonly',
        openWindow: 'readonly',
        useEffect: 'readonly',
        useHeaders: 'readonly',
        useRequests: 'readonly',
        useState: 'readonly',
        setState: 'readonly',
        prove: 'readonly',
        done: 'readonly',
      },
    },
  },

  // React overrides (extension + tutorial + demo)
  {
    files: [
      'packages/extension/**/*.{tsx,jsx}',
      'packages/demo/src/**/*.{tsx,jsx}',
      'packages/tutorial/src/**/*.{tsx,jsx}',
    ],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
);
