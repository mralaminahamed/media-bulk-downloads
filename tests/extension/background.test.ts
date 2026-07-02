import {
  updateTabBadge,
  loadSettings,
  extensionForType,
  sanitizePathSegment,
  buildDownloadFilename,
  DEFAULT_SETTINGS,
} from '@/extension/background';
import { ImageInfo, SettingsData } from '@/types';

describe('Background Script', () => {
  let mockChrome: any;

  beforeEach(() => {
    mockChrome = {
      storage: {
        sync: { get: jest.fn(), set: jest.fn() },
        onChanged: { addListener: jest.fn() },
      },
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(),
      },
      action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn(),
      },
      runtime: {
        lastError: null,
        onInstalled: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn() },
      },
    };
    global.chrome = mockChrome;
  });

  describe('extensionForType', () => {
    it('maps known types to safe extensions', () => {
      expect(extensionForType('jpeg')).toBe('jpg');
      expect(extensionForType('png')).toBe('png');
      expect(extensionForType('webp')).toBe('webp');
      expect(extensionForType('svg')).toBe('svg');
    });

    it('falls back to jpg for unknown types', () => {
      expect(extensionForType('unknown')).toBe('jpg');
      expect(extensionForType('')).toBe('jpg');
    });
  });

  describe('sanitizePathSegment', () => {
    it('strips path traversal and leading slashes', () => {
      expect(sanitizePathSegment('../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizePathSegment('/abs/path')).toBe('abs/path');
      expect(sanitizePathSegment('a/../b')).toBe('a/b');
    });

    it('removes illegal filename characters', () => {
      expect(sanitizePathSegment('bad:name?.txt')).toBe('badname.txt');
      expect(sanitizePathSegment('back\\slash')).toBe('back/slash');
    });
  });

  describe('buildDownloadFilename', () => {
    const settings: SettingsData = { ...DEFAULT_SETTINGS };
    const img = (over: Partial<ImageInfo>): ImageInfo => ({
      src: 'x.jpg', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, ...over,
    });

    it('builds a prefixed, 1-indexed filename', () => {
      expect(buildDownloadFilename(img({ type: 'jpeg' }), 0, settings)).toBe('image_1.jpg');
      expect(buildDownloadFilename(img({ type: 'png' }), 4, settings)).toBe('image_5.png');
    });

    it('prepends a sanitized download path', () => {
      const s = { ...settings, downloadPath: '../my/pics' };
      expect(buildDownloadFilename(img({ type: 'png' }), 0, s)).toBe('my/pics/image_1.png');
    });

    it('falls back to a default prefix when sanitized away', () => {
      const s = { ...settings, fileNamePrefix: '..' };
      expect(buildDownloadFilename(img({ type: 'gif' }), 0, s)).toBe('image_1.gif');
    });
  });

  describe('updateTabBadge', () => {
    it('updates badge with the eligible image count', () => {
      const tabId = 1;
      const images: ImageInfo[] = [
        { src: 'a.jpg', width: 100, height: 100, alt: 'a', type: 'jpeg', fileSize: 0, isBase64: false },
        { src: 'b.jpg', width: 100, height: 100, alt: 'b', type: 'jpeg', fileSize: 0, isBase64: false },
      ];
      mockChrome.tabs.sendMessage.mockImplementation((_id: number, _msg: string, cb: any) => cb(images));

      updateTabBadge(tabId);

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId });
      expect(mockChrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4F46E5', tabId });
    });

    it('does nothing when the tab has no content script (lastError set)', () => {
      mockChrome.runtime.lastError = { message: 'Receiving end does not exist' };
      mockChrome.tabs.sendMessage.mockImplementation((_id: number, _msg: string, cb: any) => cb(undefined));

      updateTabBadge(1);

      expect(mockChrome.action.setBadgeText).not.toHaveBeenCalled();
      expect(mockChrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
      mockChrome.runtime.lastError = null;
    });
  });

  describe('loadSettings', () => {
    it('reads settings from sync storage and refreshes badges', () => {
      const stored: SettingsData = {
        downloadPath: 'downloads',
        fileNamePrefix: 'img_',
        popupWidth: 500,
        popupHeight: 700,
        showImageCount: true,
        minimumImageSize: 50,
        excludeBase64Images: true,
      };
      mockChrome.storage.sync.get.mockImplementation((_keys: string[], cb: (r: any) => void) =>
        cb({ settings: stored }),
      );
      mockChrome.tabs.query.mockImplementation((_q: any, cb: (tabs: any[]) => void) => cb([]));

      loadSettings();

      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith(['settings'], expect.any(Function));
      // showImageCount true → refreshes all tab badges.
      expect(mockChrome.tabs.query).toHaveBeenCalled();
    });
  });
});
