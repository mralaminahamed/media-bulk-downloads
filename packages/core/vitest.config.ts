import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone Vitest project for @mbd/core. Aliases the package to its own src/
// (not the node_modules/@mbd/core symlink) so v8 coverage attributes the source.
// Aggregated by the root vitest.config.ts `projects`.
const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    name: 'core',
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Core is chrome-free; it only needs the jsdom Blob/scroll polyfills.
    setupFiles: [fileURLToPath(new URL('../../tests/setup/dom-polyfills.ts', import.meta.url))],
    testTimeout: 15000,
  },
  resolve: {
    alias: [
      { find: /^@mbd\/core\/(.*)$/, replacement: `${src}/$1` },
      { find: /^@mbd\/core$/, replacement: `${src}/index.ts` },
    ],
  },
});
