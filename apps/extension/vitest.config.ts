import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// Migrated from Jest (ts-jest). WxtVitest() applies WXT's own vite config: the
// `@/` alias (srcDir 'src'), the React plugin, WXT define/env globals, and an
// in-memory `browser`/`chrome` (fakeBrowser) via a `vi.stubGlobal` setup file.
//
// This codebase uses the global `chrome.*` namespace directly (callback-style,
// with `chrome.runtime.lastError`), which fakeBrowser (promise-only) does not
// model. So tests/setupTests.ts installs a hand-rolled, callback-aware
// `global.chrome`. It MUST run AFTER WxtVitest's virtual setup (which stubs
// `chrome` to fakeBrowser) or fakeBrowser wins — and source modules bind
// `chrome` at import time, so the winner must be set before test modules load.
// Vite appends a plugin's `config()` setupFiles after earlier plugins', so
// registering ours from a plugin listed AFTER WxtVitest lands it last.
const chromeMockSetupLast = {
  name: 'chrome-mock-setup-last',
  config: () => ({ test: { setupFiles: ['./tests/unit/setupTests.ts'] } }),
};

export default defineConfig({
  plugins: [WxtVitest(), chromeMockSetupLast],
  test: {
    name: 'extension',
    // Unit/integration suite lives under tests/unit; the Playwright e2e specs
    // live under tests/e2e (run separately via `yarn test:e2e`). Scoping the
    // include to tests/unit keeps Vitest from ever collecting the e2e specs.
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    // Headroom for React async queries under v8 coverage instrumentation.
    testTimeout: 15000,
    // setupFiles intentionally omitted here — registered via the trailing
    // plugin above so it runs after WxtVitest's fakeBrowser stub.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Vitest v4 removed the `all` option; the v8 provider already reports only
      // files executed during the run (the old `all: false` behavior), so no
      // extra config is needed to keep untested files out of the report.
    },
  },
});
