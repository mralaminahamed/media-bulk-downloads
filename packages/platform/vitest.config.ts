import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone Vitest project for @mbd/platform. Aliases the package to its own
// src/ (not the node_modules/@mbd/platform symlink) so v8 coverage attributes
// the source files. Aggregated by the root vitest.config.ts `projects`.
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
