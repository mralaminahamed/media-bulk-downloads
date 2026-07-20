import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    name: 'platform',
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: [
      { find: /^@mbd\/platform\/(.*)$/, replacement: `${src}/$1` },
      { find: /^@mbd\/platform$/, replacement: `${src}/index.ts` },
    ],
  },
});
