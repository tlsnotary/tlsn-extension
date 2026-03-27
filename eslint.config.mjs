import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
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
      'packages/demo/',
      'packages/ts-plugin-sample/',
      'packages/tlsn-wasm-pkg/',
    ],
  },

  // Base config for all JS/TS files
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
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
      'no-debugger': 'error',
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
      '@typescript-eslint/no-empty-function': 'off',
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
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'padding-line-between-statements': 'error',
    },
  },

  // React overrides (extension + tutorial)
  {
    files: [
      'packages/extension/**/*.{tsx,jsx}',
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
    },
  },
);
