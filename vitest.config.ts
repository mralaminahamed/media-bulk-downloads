import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/storage/vitest.config.ts',
      'packages/platform/vitest.config.ts',
    ],
    maxWorkers: '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
    },
  },
});
