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
  config: () => ({ test: { setupFiles: ['./tests/setupTests.ts'] } }),
};

export default defineConfig({
  plugins: [WxtVitest(), chromeMockSetupLast],
  test: {
    environment: 'jsdom',
    globals: true,
    // Headroom for React async queries under v8 coverage instrumentation.
    testTimeout: 15000,
    // setupFiles intentionally omitted here — registered via the trailing
    // plugin above so it runs after WxtVitest's fakeBrowser stub.
    // Bound workers so the memory-heavy mp4box muxer test (~2 MB) can't
    // over-subscribe RAM and flake sibling workers — mirrors Jest's `50%`.
    maxWorkers: '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Report only files exercised by tests (Jest's implicit default).
      all: false,
    },
  },
});
