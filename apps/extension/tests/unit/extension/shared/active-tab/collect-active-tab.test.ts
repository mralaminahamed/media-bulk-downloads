import type { Mock } from 'vitest';
import { collectFromActiveTab, getPageType } from '@/extension/shared/active-tab/collect-active-tab';
import { ImageInfo } from '@mbd/core/types';

describe('collectFromActiveTab', () => {
  const sample: ImageInfo[] = [
    { src: 'a.jpg', alt: '', width: 10, height: 10, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
  ];

  beforeEach(() => {
    (chrome.runtime as { lastError?: unknown }).lastError = undefined;
  });

  it('resolves with the images the content script returns', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => cb(sample));

    await expect(collectFromActiveTab()).resolves.toEqual(sample);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, 'GET_IMAGES', expect.any(Function));
  });

  it('normalizes a non-array response to an empty array', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => cb(undefined));

    await expect(collectFromActiveTab()).resolves.toEqual([]);
  });

  it('rejects when there is no active tab', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([]);
    await expect(collectFromActiveTab()).rejects.toThrow('No active tab found.');
  });

  it('rejects when the content script is unreachable (lastError)', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => {
      (chrome.runtime as { lastError?: unknown }).lastError = { message: 'Receiving end does not exist' };
      cb(undefined);
    });

    await expect(collectFromActiveTab()).rejects.toThrow('Receiving end does not exist');
  });

  it('rejects with a fallback message when lastError carries no message', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => {
      (chrome.runtime as { lastError?: unknown }).lastError = {};
      cb(undefined);
    });

    await expect(collectFromActiveTab()).rejects.toThrow('unknown error');
  });
});

describe('getPageType', () => {
  beforeEach(() => {
    (chrome.runtime as { lastError?: unknown }).lastError = undefined;
  });

  it('resolves the classified page type the content script returns', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => cb('gallery'));

    await expect(getPageType()).resolves.toBe('gallery');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, 'GET_PAGE_TYPE', expect.any(Function));
  });

  it('resolves "unknown" when there is no active tab', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([]);
    await expect(getPageType()).resolves.toBe('unknown');
  });

  it('resolves "unknown" when the content script is unreachable (lastError)', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => {
      (chrome.runtime as { lastError?: unknown }).lastError = { message: 'Receiving end does not exist' };
      cb(undefined);
    });

    await expect(getPageType()).resolves.toBe('unknown');
  });

  it('resolves "unknown" when the content script responds with no page type (no lastError)', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => cb(undefined));

    await expect(getPageType()).resolves.toBe('unknown');
  });

  it('resolves "unknown" when chrome.tabs.query itself rejects', async () => {
    (chrome.tabs.query as Mock).mockRejectedValue(new Error('no tabs permission'));
    await expect(getPageType()).resolves.toBe('unknown');
  });

  it('resolves "unknown" when chrome.tabs is unavailable (content-script context, e.g. the bubble)', async () => {
    const savedTabs = chrome.tabs;
    (chrome as { tabs?: unknown }).tabs = undefined;
    try {
      await expect(getPageType()).resolves.toBe('unknown');
    } finally {
      chrome.tabs = savedTabs;
    }
  });
});
