import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    name: 'core',
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
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
