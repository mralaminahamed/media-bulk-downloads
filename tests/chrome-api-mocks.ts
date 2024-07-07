export const mockChrome = {
    runtime: {
      onInstalled: {
        addListener: jest.fn(),
      },
      onMessage: {
        addListener: jest.fn(),
      },
      sendMessage: jest.fn(),
    },
    tabs: {
      query: jest.fn().mockImplementation(() => Promise.resolve([])),
      sendMessage: jest.fn().mockImplementation(() => Promise.resolve()),
    },
    downloads: {
      download: jest.fn(),
    },
    storage: {
      sync: {
        get: jest.fn(),
        set: jest.fn(),
      },
    },
  };
  
  export function setupChromeApiMocks() {
    global.chrome = mockChrome as any;
  }