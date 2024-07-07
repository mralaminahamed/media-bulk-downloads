import { isExtensionPopup, getExtensionContext } from './../../../src/extension/popup/utils';

describe('utils', () => {
    describe('isExtensionPopup', () => {
      beforeEach(() => {
        // Reset and mock Chrome API for each test
        global.chrome = {
          action: {},
          tabs: {
            query: jest.fn(),
          },
          windows: {
            getCurrent: jest.fn(),
          },
        } as any;
      });
  
      it('returns false when chrome.action is not available', async () => {
        delete global.chrome.action;
        const result = await isExtensionPopup();
        expect(result).toBe(false);
      });
  
      it('returns true when there are no active tabs', async () => {
        global.chrome.tabs.query = jest.fn((_, callback) => callback([]));
        const result = await isExtensionPopup();
        expect(result).toBe(true);
      });
  
      it('returns true when the current window is a popup', async () => {
        global.chrome.tabs.query = jest.fn((_, callback) => callback([{ id: 1 }]));
        global.chrome.windows.getCurrent = jest.fn((callback) => callback({ type: 'popup' }));
        const result = await isExtensionPopup();
        expect(result).toBe(true);
      });
  
      it('returns false when the current window is not a popup', async () => {
        global.chrome.tabs.query = jest.fn((_, callback) => callback([{ id: 1 }]));
        global.chrome.windows.getCurrent = jest.fn((callback) => callback({ type: 'normal' }));
        const result = await isExtensionPopup();
        expect(result).toBe(false);
      });
    });
  
    describe('getExtensionContext', () => {
      const originalLocation = window.location;
      
      beforeEach(() => {
        delete (window as any).location;
        window.location = { ...originalLocation, href: '' };
        global.chrome = {} as any;
      });
  
      afterAll(() => {
        window.location = originalLocation;
      });
  
      it('returns "popup" when URL includes index.html', () => {
        window.location.href = 'chrome-extension://extension-id/index.html';
        global.chrome.extension = {};
        expect(getExtensionContext()).toBe('popup');
      });
  
      it('returns "content-script" when chrome.runtime.getManifest is available', () => {
        global.chrome.extension = {};
        global.chrome.runtime = { getManifest: jest.fn() };
        expect(getExtensionContext()).toBe('content-script');
      });
  
      it('returns "other" when not in an extension context', () => {
        expect(getExtensionContext()).toBe('other');
      });
  
      it('returns "other" when chrome.extension is available but conditions are not met', () => {
        global.chrome.extension = {};
        window.location.href = 'https://example.com';
        expect(getExtensionContext()).toBe('other');
      });
    });
  });