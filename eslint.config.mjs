import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/build/',
      '**/coverage/',
      'packages/extension/zip/',
      'packages/extension/wasm/',
      'packages/extension/tlsn/',
      'packages/extension/util/',
      'packages/extension/lib/',
      'packages/extension/plugins/',
      'packages/extension/webpack.config.js',
      'packages/extension/utils/',
      'packages/plugin-sdk/*.config.{ts,js}',
      'packages/demo/',
      'packages/ts-plugin-sample/',
      'packages/verifier/',
      'packages/tlsn-wasm/',
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
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    rules: {
      'prettier/prettier': 'error',
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
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
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
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'error',
      'no-useless-escape': 'off',
      'padding-line-between-statements': 'error',
    },
  },

  // Tutorial-specific overrides (React)
  {
    files: ['packages/tutorial/src/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
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
