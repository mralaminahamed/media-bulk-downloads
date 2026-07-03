/**
 * Exercises background listeners registered at import time (download handler,
 * toolbar click, settings changes). These use the shared setup mock rather than
 * a per-test replacement so the captured listeners see the same chrome object.
 */
import '@/extension/background';
import { ImageInfo, SettingsData } from '@/types';

const img = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'x.jpg', alt: '', width: 100, height: 100, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...over,
});

const onMessage = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
const onClicked = (chrome.action.onClicked.addListener as jest.Mock).mock.calls[0][0];
const onChanged = (chrome.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];

const setSettings = (patch: Partial<SettingsData>) =>
  onChanged({ settings: { newValue: patch } }, 'sync');

describe('background DOWNLOAD_IMAGES handler', () => {
  beforeEach(() => {
    (chrome.downloads.download as jest.Mock).mockClear();
    setSettings({}); // reset to defaults
  });

  it('downloads every eligible image with a prefixed, 1-indexed name', () => {
    const sendResponse = jest.fn();
    const images = [img({ src: 'a.jpg', type: 'jpeg' }), img({ src: 'b.png', type: 'png' })];

    onMessage({ type: 'DOWNLOAD_IMAGES', images }, {}, sendResponse);

    expect(chrome.downloads.download).toHaveBeenNthCalledWith(1, {
      url: 'a.jpg',
      filename: 'image_1.jpg',
      saveAs: false,
      conflictAction: 'uniquify',
    });
    expect(chrome.downloads.download).toHaveBeenNthCalledWith(2, {
      url: 'b.png',
      filename: 'image_2.png',
      saveAs: false,
      conflictAction: 'uniquify',
    });
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Downloading 2 images...' });
  });

  it('applies the download path and prefix from settings', () => {
    setSettings({ downloadPath: 'Pics/2026', fileNamePrefix: 'shot-' });
    const sendResponse = jest.fn();

    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' })] }, {}, sendResponse);

    expect(chrome.downloads.download).toHaveBeenCalledWith({
      url: 'a.jpg',
      filename: 'Pics/2026/shot-1.jpg',
      saveAs: false,
      conflictAction: 'uniquify',
    });
  });

  it('re-filters by the current settings (min size + base64)', () => {
    setSettings({ minimumImageSize: 50, excludeBase64Images: true });
    const sendResponse = jest.fn();
    const images = [
      img({ src: 'big.jpg', width: 200, height: 200 }),
      img({ src: 'tiny.jpg', width: 10, height: 10 }),
      img({ src: 'data', isBase64: true, width: 0, height: 0 }),
    ];

    onMessage({ type: 'DOWNLOAD_IMAGES', images }, {}, sendResponse);

    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'big.jpg' }),
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Downloading 1 images...' });
  });

  it('ignores unrelated messages', () => {
    const sendResponse = jest.fn();
    onMessage('GET_IMAGES', {}, sendResponse);
    onMessage({ type: 'SOMETHING_ELSE' }, {}, sendResponse);
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('background toolbar click', () => {
  beforeEach(() => (chrome.tabs.sendMessage as jest.Mock).mockClear());

  it('toggles the bubble on the clicked tab', () => {
    onClicked({ id: 12 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(12, 'TOGGLE_BUBBLE', expect.any(Function));
  });

  it('does nothing for a tab without an id', () => {
    onClicked({});
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
