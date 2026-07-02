import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Flat config (ESLint v9+). Replaces the legacy .eslintrc.json.
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.yarn/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      // Pinned rather than 'detect': eslint-plugin-react's auto-detect path is
      // incompatible with ESLint 10's context API and throws.
      react: { version: '19' },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...(reactHooks.configs.recommended?.rules ?? {}),
      // React 17+ JSX transform — no need to import React in scope.
      'react/react-in-jsx-scope': 'off',
      // React Compiler rules (bundled in react-hooks v7 recommended). This
      // project doesn't use the compiler, so its manual-memoization/immutability
      // opinions don't apply; keep the classic rules-of-hooks + exhaustive-deps.
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Test files run under Jest.
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
