import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Flat config (ESLint v9+). Replaces the legacy .eslintrc.json.
export default [
  {
    ignores: [
      '**/.output/**', '**/.wxt/**', '**/node_modules/**', '**/coverage/**', '**/.tsbuild/**', '.yarn/**',
      // Generated/build artifacts (gitignored, not source): the Safari converter's
      // Xcode project + build output, and the assets build scratch dir. Linting the
      // minified bundles they contain produced thousands of spurious errors.
      'apps/safari-native/DerivedData/**',
      'apps/safari-native/Media Bulk Downloads/**',
      'apps/safari-native/MediaBulkDownloads/**',
      'assets/v2/**',
      // Gitignored scratch: console-paste research scripts (browser globals, not
      // part of the build). Present only on machines that ran them; linting them
      // fails the gate locally for no reason and CI never sees them.
      'test-samples/**',
    ],
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
    // Test files run under Vitest, but exercise browser APIs (fetch, window, DOM)
    // under jsdom, so they need the browser globals too.
    files: ['**/tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // TypeScript already resolves identifiers, and no-undef false-positives on
      // type-only DOM names (e.g. `as unknown as RequestInfo`), so turn it off here.
      'no-undef': 'off',
    },
  },
  {
    // Playwright e2e: specs + fixtures + the static fixture server. Node globals
    // (the server, process) plus browser globals (page.evaluate bodies run in the
    // page). Playwright's fixture signature `async ({}, use)` trips React's
    // rules-of-hooks (on `use`) and no-empty-pattern — neither applies to e2e.
    files: ['**/tests/e2e/**/*.{ts,mjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'off',
      'no-empty-pattern': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];
