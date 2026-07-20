import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

const chromeMockSetupLast = {
  name: 'chrome-mock-setup-last',
  config: () => ({ test: { setupFiles: ['./tests/unit/setupTests.ts'] } }),
};

export default defineConfig({
  plugins: [WxtVitest(), chromeMockSetupLast],
  test: {
    name: 'extension',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Vitest v4 removed the `all` option; the v8 provider already reports only
      // files executed during the run (the old `all: false` behavior), so no
      // extra config is needed to keep untested files out of the report.
    },
  },
});
