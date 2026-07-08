import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// v8 coverage instrumentation + parallel workers can starve a worker's event
// loop for seconds, so testing-library's 1000ms default for findBy* flakes.
// Give async queries generous headroom (still under the per-test timeout).
configure({ asyncUtilTimeout: 8000 });

// jsdom does not implement Blob.prototype.arrayBuffer; some download/convert
// code sniffs a blob's header bytes, so provide a FileReader-backed polyfill.
if (!(Blob.prototype as { arrayBuffer?: unknown }).arrayBuffer) {
    (Blob.prototype as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = function (this: Blob) {
        return new Promise<ArrayBuffer>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as ArrayBuffer);
            fr.onerror = () => reject(fr.error);
            fr.readAsArrayBuffer(this);
        });
    };
}

// Backing store for the chrome.storage.local mock below.
const localStorageStore: Record<string, unknown> = {};

// A reasonably complete Chrome API mock so extension modules (which register
// event listeners at import time) can be imported without crashing. Individual
// tests override specific methods as needed.
global.chrome = {
    runtime: {
        sendMessage: vi.fn(),
        onInstalled: {
            addListener: vi.fn(),
        },
        onMessage: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
        },
        onStartup: {
            addListener: vi.fn(),
        },
        getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
        lastError: undefined,
    },
    notifications: {
        create: vi.fn(),
    },
    permissions: {
        request: vi.fn(),
        contains: vi.fn(),
    },
    contextMenus: {
        create: vi.fn(),
        removeAll: vi.fn((cb?: () => void) => cb?.()),
        onClicked: {
            addListener: vi.fn(),
        },
    },
    commands: {
        onCommand: {
            addListener: vi.fn(),
        },
    },
    tabs: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        create: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onActivated: {
            addListener: vi.fn(),
        },
        onUpdated: {
            addListener: vi.fn(),
        },
        onRemoved: {
            addListener: vi.fn(),
        },
    },
    storage: {
        sync: {
            get: vi.fn(),
            set: vi.fn(),
        },
        // Backed by a real in-memory store so storage modules (favourites,
        // history, excluded, ...) round-trip across get/set within a test —
        // individual tests still override get/set with mockResolvedValue /
        // mockImplementation when they need a specific canned shape.
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
        },
        onChanged: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
        },
    },
    downloads: {
        download: vi.fn(),
        open: vi.fn(),
        show: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
    },
    offscreen: {
        Reason: { BLOBS: 'BLOBS' },
        hasDocument: vi.fn().mockResolvedValue(false),
        createDocument: vi.fn().mockResolvedValue(undefined),
        closeDocument: vi.fn().mockResolvedValue(undefined),
    },
    action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
        setPopup: vi.fn(),
        onClicked: {
            addListener: vi.fn(),
        },
    },
    windows: {
        getCurrent: vi.fn(),
    },
} as unknown as typeof chrome;

// Reset the in-memory chrome.storage.local backing store after every test so
// state written by one test never leaks into a later test in the same file.
afterEach(() => {
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
});
