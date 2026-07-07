import '@testing-library/jest-dom';

// Backing store for the chrome.storage.local mock below.
const localStorageStore: Record<string, unknown> = {};

// A reasonably complete Chrome API mock so extension modules (which register
// event listeners at import time) can be imported without crashing. Individual
// tests override specific methods as needed.
global.chrome = {
    runtime: {
        sendMessage: jest.fn(),
        onInstalled: {
            addListener: jest.fn(),
        },
        onMessage: {
            addListener: jest.fn(),
            removeListener: jest.fn(),
        },
        onStartup: {
            addListener: jest.fn(),
        },
        getURL: jest.fn((p: string) => `chrome-extension://test/${p}`),
        lastError: undefined,
    },
    notifications: {
        create: jest.fn(),
    },
    permissions: {
        request: jest.fn(),
        contains: jest.fn(),
    },
    contextMenus: {
        create: jest.fn(),
        removeAll: jest.fn((cb?: () => void) => cb?.()),
        onClicked: {
            addListener: jest.fn(),
        },
    },
    commands: {
        onCommand: {
            addListener: jest.fn(),
        },
    },
    tabs: {
        query: jest.fn().mockResolvedValue([]),
        get: jest.fn(),
        create: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        onActivated: {
            addListener: jest.fn(),
        },
        onUpdated: {
            addListener: jest.fn(),
        },
        onRemoved: {
            addListener: jest.fn(),
        },
    },
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn(),
        },
        // Backed by a real in-memory store so storage modules (favourites,
        // history, excluded, ...) round-trip across get/set within a test —
        // individual tests still override get/set with mockResolvedValue /
        // mockImplementation when they need a specific canned shape.
        local: {
            get: jest.fn((keys?: string | string[] | Record<string, unknown> | null) => {
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
            set: jest.fn((items: Record<string, unknown>) => {
                Object.assign(localStorageStore, items);
                return Promise.resolve(undefined);
            }),
        },
        onChanged: {
            addListener: jest.fn(),
            removeListener: jest.fn(),
        },
    },
    downloads: {
        download: jest.fn(),
        open: jest.fn(),
        show: jest.fn(),
        search: jest.fn().mockResolvedValue([]),
    },
    offscreen: {
        Reason: { BLOBS: 'BLOBS' },
        hasDocument: jest.fn().mockResolvedValue(false),
        createDocument: jest.fn().mockResolvedValue(undefined),
        closeDocument: jest.fn().mockResolvedValue(undefined),
    },
    action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn(),
        setPopup: jest.fn(),
        onClicked: {
            addListener: jest.fn(),
        },
    },
    windows: {
        getCurrent: jest.fn(),
    },
} as unknown as typeof chrome;
