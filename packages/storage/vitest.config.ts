import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    name: 'storage',
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: [fileURLToPath(new URL('../../tests/setup/chrome-mock.ts', import.meta.url))],
    testTimeout: 15000,
  },
  resolve: {
    alias: [
      { find: /^@mbd\/storage\/(.*)$/, replacement: `${src}/$1` },
    ],
  },
});
