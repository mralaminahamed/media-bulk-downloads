import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone Vitest project for @mbd/storage. Aliases the package to its own
// src/ so v8 coverage attributes the source; @mbd/core imports resolve via the
// workspace symlink (covered by the core project). Aggregated by the root config.
const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    name: 'storage',
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Storage exercises chrome.storage + IndexedDB.
    setupFiles: [fileURLToPath(new URL('../../tests/setup/chrome-mock.ts', import.meta.url))],
    testTimeout: 15000,
  },
  resolve: {
    alias: [
      { find: /^@mbd\/storage\/(.*)$/, replacement: `${src}/$1` },
    ],
  },
});
