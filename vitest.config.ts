import { defineConfig } from 'vitest/config';

// Test runner for the WORKSPACE PACKAGES (@mbd/core, @mbd/storage, @mbd/platform).
// Each project owns its environment, setup, and `@mbd/*`→src alias so v8 coverage
// attributes package source instead of dropping it as a node_modules symlink.
//
// The WXT app (@mbd/extension) is NOT a project here: WxtVitest does not compose
// as a Vitest sub-project (its `@/` alias resolves against the wrong cwd). The
// app runs under its own config via `yarn workspace @mbd/extension test`; the
// root `test` script chains both. See package.json `test`.
export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/storage/vitest.config.ts',
      'packages/platform/vitest.config.ts',
    ],
    // Bound workers globally (projects must agree) so the memory-heavy mp4box
    // muxer test can't over-subscribe RAM and flake sibling workers.
    maxWorkers: '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
    },
  },
});
