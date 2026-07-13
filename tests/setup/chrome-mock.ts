// Shared chrome.* + IndexedDB test setup for package projects that exercise the
// extension storage APIs (e.g. @mbd/storage). Extracted from the app's
// setupTests.ts so the storage package can run standalone.
import 'fake-indexeddb/auto';

// Backing store for the chrome.storage.local mock below.
const localStorageStore: Record<string, unknown> = {};

// A reasonably complete Chrome API mock so extension modules (which register
// event listeners at import time) can be imported without crashing. Individual
// tests override specific methods as needed.
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
    lastError: undefined,
  },
  storage: {
    sync: { get: vi.fn(), set: vi.fn() },
    // Backed by a real in-memory store so storage modules round-trip across
    // get/set within a test — individual tests still override as needed.
    local: {
      get: vi.fn((keys?: string | string[] | Record<string, unknown> | null) => {
        if (keys == null) return Promise.resolve({ ...localStorageStore });
        if (typeof keys === 'string') {
          return Promise.resolve(keys in localStorageStore ? { [keys]: localStorageStore[keys] } : {});
        }
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {};
          keys.forEach((k) => { if (k in localStorageStore) out[k] = localStorageStore[k]; });
          return Promise.resolve(out);
        }
        const defaults = keys as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        Object.keys(defaults).forEach((k) => {
          out[k] = k in localStorageStore ? localStorageStore[k] : defaults[k];
        });
        return Promise.resolve(out);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(localStorageStore, items);
        return Promise.resolve(undefined);
      }),
      clear: vi.fn(() => {
        for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
        return Promise.resolve(undefined);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  downloads: {
    download: vi.fn(), open: vi.fn(), show: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
} as unknown as typeof chrome;

// Reset the in-memory chrome.storage.local backing store after every test so
// state written by one test never leaks into a later test in the same file.
// First drain a macrotask so deferred async (IDB mirror writes, serialized
// continuations) settles within its own test boundary.
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
});
