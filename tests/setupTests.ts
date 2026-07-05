import '@testing-library/jest-dom';

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
        lastError: undefined,
    },
    tabs: {
        query: jest.fn().mockResolvedValue([]),
        get: jest.fn(),
        create: jest.fn(),
        sendMessage: jest.fn(),
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
        local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue(undefined),
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
