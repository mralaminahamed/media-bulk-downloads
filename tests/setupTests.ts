import '@testing-library/jest-dom';

// Mock chrome API
global.chrome = {
    runtime: {
        sendMessage: jest.fn(),
        onMessage: {
            addListener: jest.fn(),
        },
    },
    tabs: {
        query: jest.fn(),
    },
} as any;
