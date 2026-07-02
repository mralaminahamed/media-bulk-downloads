import { collectFromActiveTab } from '@/extension/shared/collect-active-tab';
import { ImageInfo } from '@/types';

describe('collectFromActiveTab', () => {
  const sample: ImageInfo[] = [
    { src: 'a.jpg', alt: '', width: 10, height: 10, type: 'jpeg', fileSize: 0, isBase64: false },
  ];

  beforeEach(() => {
    (chrome.runtime as { lastError?: unknown }).lastError = undefined;
  });

  it('resolves with the images the content script returns', async () => {
    (chrome.tabs.query as jest.Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_id, _msg, cb) => cb(sample));

    await expect(collectFromActiveTab()).resolves.toEqual(sample);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, 'GET_IMAGES', expect.any(Function));
  });

  it('normalizes a non-array response to an empty array', async () => {
    (chrome.tabs.query as jest.Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_id, _msg, cb) => cb(undefined));

    await expect(collectFromActiveTab()).resolves.toEqual([]);
  });

  it('rejects when there is no active tab', async () => {
    (chrome.tabs.query as jest.Mock).mockResolvedValue([]);
    await expect(collectFromActiveTab()).rejects.toThrow('No active tab found.');
  });

  it('rejects when the content script is unreachable (lastError)', async () => {
    (chrome.tabs.query as jest.Mock).mockResolvedValue([{ id: 7 }]);
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_id, _msg, cb) => {
      (chrome.runtime as { lastError?: unknown }).lastError = { message: 'Receiving end does not exist' };
      cb(undefined);
    });

    await expect(collectFromActiveTab()).rejects.toThrow('Receiving end does not exist');
  });
});
