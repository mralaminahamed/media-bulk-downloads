import type { Mock } from 'vitest';
vi.mock('@mbd/storage/excluded', async () => ({
  ...(await vi.importActual<typeof import('@mbd/storage/excluded')>('@mbd/storage/excluded')),
  addExcluded: vi.fn().mockResolvedValue(undefined),
  removeExcluded: vi.fn().mockResolvedValue(undefined),
  clearExcluded: vi.fn().mockResolvedValue(undefined),
}));
import * as excludedMod from '@mbd/storage/excluded';
vi.mock('@/extension/background/download/sidecar-writer', () => ({
  scheduleSidecar: vi.fn(),
  __resetSidecarWriter: vi.fn(),
}));
import { scheduleSidecar } from '@/extension/background/download/sidecar-writer';
import * as dlKeys from '@/extension/background/download/downloaded-keys';
import { SrcKeySet } from '@mbd/core/collection/canonical';

import {
  updateTabBadge,
  loadSettings,
  extensionForType,
  sanitizePathSegment,
  buildDownloadFilename,
  isInjectableUrl,
  originalNameFromUrl,
  DEFAULT_SETTINGS,
  resolveOriginalsBatch,
  downloadAndRecord,
  downloadStatusMessage,
  setupContextMenus,
  mediaFromContext,
} from '@/extension/background';
import { CaptureRunResult, ImageInfo, SettingsData } from '@mbd/core/types';

const messageHandler = (global.chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];
const contextMenuHandler = (global.chrome.contextMenus.onClicked.addListener as Mock).mock.calls[0][0];
const commandHandler = (global.chrome.commands.onCommand.addListener as Mock).mock.calls[0][0];
const storageChangedHandler = (global.chrome.storage.onChanged.addListener as Mock).mock.calls[0][0];

describe('Background Script', () => {
  let mockChrome: any;
  const realChrome = global.chrome;

  beforeEach(() => {
    mockChrome = {
      storage: {
        sync: { get: vi.fn(), set: vi.fn() },
        onChanged: { addListener: vi.fn() },
      },
      tabs: {
        query: vi.fn(),
        sendMessage: vi.fn(),
      },
      action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
        setPopup: vi.fn(),
        onClicked: { addListener: vi.fn() },
      },
      runtime: {
        lastError: null,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
      },
    };
    global.chrome = mockChrome;
  });

  afterAll(() => {
    global.chrome = realChrome;
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

  describe('jpeg extension', () => {
    it('maps jpeg type to the conventional .jpg extension', () => {
      expect(extensionForType('jpeg')).toBe('jpg');
    });

    it('names a jpeg image file with .jpg', () => {
      const img = { src: 'https://pbs.twimg.com/media/ABC?format=jpg&name=orig', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const };
      const name = buildDownloadFilename(img, 0, { ...DEFAULT_SETTINGS, namingMode: 'original', downloadPath: '' });
      expect(name).toMatch(/\.jpg$/);
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

    it('neutralizes Windows trailing dots/spaces and reserved device names', () => {
      expect(sanitizePathSegment('.. /x')).toBe('x');
      expect(sanitizePathSegment('name.')).toBe('name');
      expect(sanitizePathSegment('CON.jpg')).toBe('_CON.jpg');
      expect(sanitizePathSegment('a/lpt1/b')).toBe('a/_lpt1/b');
    });
  });

  describe('buildDownloadFilename', () => {
    const settings: SettingsData = { ...DEFAULT_SETTINGS };
    const img = (over: Partial<ImageInfo>): ImageInfo => ({
      src: 'x.jpg', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...over,
    });

    it('builds a prefixed, 1-indexed filename', () => {
      expect(buildDownloadFilename(img({ type: 'jpeg' }), 0, settings)).toBe('image_1.jpg');
      expect(buildDownloadFilename(img({ type: 'png' }), 4, settings)).toBe('image_5.png');
    });

    it('prefers the resolver-supplied ext over the type-derived extension', () => {
      expect(buildDownloadFilename(img({ type: 'jpeg', ext: 'jpg' }), 0, settings)).toBe('image_1.jpg');
      expect(buildDownloadFilename(img({ type: 'jpeg', ext: 'png' }), 0, settings)).toBe('image_1.png');
    });

    it('falls back to the type-derived extension when the resolver gave no ext', () => {
      expect(buildDownloadFilename(img({ type: 'jpeg' }), 0, settings)).toBe('image_1.jpg');
    });

    it('uses the resolver ext in original-name mode too', () => {
      const s = { ...settings, namingMode: 'original' as const };
      expect(
        buildDownloadFilename(img({ src: 'https://w.wallhaven.cc/full/po/wallhaven-po7y9j.jpg', type: 'jpeg', ext: 'jpg' }), 0, s),
      ).toBe('wallhaven-po7y9j.jpg');
    });

    it('prepends a sanitized download path', () => {
      const s = { ...settings, downloadPath: '../my/pics' };
      expect(buildDownloadFilename(img({ type: 'png' }), 0, s)).toBe('my/pics/image_1.png');
    });

    it('falls back to a default prefix when sanitized away', () => {
      const s = { ...settings, fileNamePrefix: '..' };
      expect(buildDownloadFilename(img({ type: 'gif' }), 0, s)).toBe('image_1.gif');
    });

    it('uses the original URL name in original mode, with type-derived extension', () => {
      const s = { ...settings, namingMode: 'original' as const };
      expect(buildDownloadFilename(img({ src: 'https://x.com/a/cat.png', type: 'jpeg' }), 0, s)).toBe('cat.jpg');
    });

    it('falls back to the prefix+index when the URL has no usable name', () => {
      const s = { ...settings, namingMode: 'original' as const };
      expect(buildDownloadFilename(img({ src: 'data:image/png;base64,AAAA', type: 'png' }), 4, s)).toBe('image_5.png');
    });

    it('prepends the subfolder in original mode too', () => {
      const s = { ...settings, namingMode: 'original' as const, downloadPath: 'Pics' };
      expect(buildDownloadFilename(img({ src: 'https://x.com/a/dog.webp', type: 'webp' }), 0, s)).toBe('Pics/dog.webp');
    });

    it('expands {domain} from the source page URL', () => {
      const s = { ...settings, downloadPath: 'Media/{domain}' };
      expect(
        buildDownloadFilename(img({ type: 'png' }), 0, s, 'https://www.twitter.com/x/status/1'),
      ).toBe('Media/twitter.com/image_1.png');
    });

    it('expands {host} and {kind} tokens', () => {
      const s = { ...settings, downloadPath: '{kind}/{host}' };
      expect(
        buildDownloadFilename(img({ type: 'jpeg' }), 0, s, 'https://cdn.example.org/a'),
      ).toBe('image/cdn.example.org/image_1.jpg');
    });

    it('collapses site tokens when the source host is unknown', () => {
      const s = { ...settings, downloadPath: 'Media/{domain}' };
      expect(buildDownloadFilename(img({ type: 'png' }), 0, s)).toBe('Media/image_1.png');
    });

    it('names a video download with its av extension', () => {
      const item = {
        src: 'https://ex.com/clip.mp4', alt: '', width: 0, height: 0,
        type: 'mp4', fileSize: 0, isBase64: false, kind: 'video' as const,
      };
      const name = buildDownloadFilename(item, 0, { ...DEFAULT_SETTINGS, namingMode: 'original' });
      expect(name).toBe('clip.mp4');
    });

    it('falls back to the URL extension for an unknown av type', () => {
      const item = {
        src: 'https://ex.com/take.mkv', alt: '', width: 0, height: 0,
        type: 'unknown', fileSize: 0, isBase64: false, kind: 'video' as const,
      };
      const name = buildDownloadFilename(item, 0, { ...DEFAULT_SETTINGS, namingMode: 'original' });
      expect(name.endsWith('.mkv')).toBe(true);
    });
  });

  describe('isInjectableUrl', () => {
    it('accepts http(s) and file pages', () => {
      expect(isInjectableUrl('https://example.com')).toBe(true);
      expect(isInjectableUrl('http://example.com/page')).toBe(true);
      expect(isInjectableUrl('file:///Users/me/pic.html')).toBe(true);
    });

    it('rejects browser pages, the extension gallery, and the Web Store', () => {
      expect(isInjectableUrl('chrome://extensions')).toBe(false);
      expect(isInjectableUrl('chrome-extension://abc/index.html')).toBe(false);
      expect(isInjectableUrl('https://chromewebstore.google.com/detail/x')).toBe(false);
      expect(isInjectableUrl('https://chrome.google.com/webstore/detail/x')).toBe(false);
      expect(isInjectableUrl('https://addons.mozilla.org/en-US/firefox/addon/x')).toBe(false);
      expect(isInjectableUrl(undefined)).toBe(false);
    });
  });

  describe('updateTabBadge', () => {
    it('updates badge with the eligible image count', async () => {
      const tabId = 1;
      const images: ImageInfo[] = [
        { src: 'a.jpg', width: 100, height: 100, alt: 'a', type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
        { src: 'b.jpg', width: 100, height: 100, alt: 'b', type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
      ];
      mockChrome.storage.sync.get.mockImplementation((_k: string[], cb: (r: any) => void) =>
        cb({ settings: { ...DEFAULT_SETTINGS } }),
      );
      loadSettings();
      mockChrome.tabs.sendMessage.mockImplementation((_id: number, _msg: string, cb: any) => cb(images));

      updateTabBadge(tabId);
      await new Promise((r) => setTimeout(r, 0));

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId });
      expect(mockChrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4F46E5', tabId });
    });

    it('clears any stale badge when the tab has no content script (lastError set)', async () => {
      mockChrome.storage.sync.get.mockImplementation((_k: string[], cb: (r: any) => void) =>
        cb({ settings: { ...DEFAULT_SETTINGS } }),
      );
      loadSettings();
      mockChrome.runtime.lastError = { message: 'Receiving end does not exist' };
      mockChrome.tabs.sendMessage.mockImplementation((_id: number, _msg: string, cb: any) => cb(undefined));

      updateTabBadge(1);
      await new Promise((r) => setTimeout(r, 0));

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
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
        saveAs: false,
        notifyOnComplete: false,
        convertImagesTo: 'off',
        convertMetadata: 'preserve',
        namingMode: 'prefixed',
        thumbnailSize: 120,
        previewSize: 360,
        bubbleEnabled: false,
        bubblePosition: { corner: 'bottom-right', x: 20, y: 20 },
        bubbleWidth: 440,
        bubbleHeight: 560,
        bubblePanelPlacement: 'anchored',
        bubblePanelPoint: { x: 40, y: 40 },
        resolveOriginals: false,
        sankakuAuthedOriginals: false,
        fetchImages: true, fetchVideo: true, fetchAudio: true,
        captureHlsStreams: false, streamQuality: 'auto', audioFormat: 'm4a', metadataSidecar: false, nearDuplicateThreshold: 8,
        downloadConcurrency: 5,
        excludeEmoji: false,
        deepScanMaxItems: 1000,
        deepScanMaxSeconds: 20,
        deepScanMaxScrolls: 40,
        deepScanClickLoadMore: false,
        smartPageDefaults: false,
        rememberScanBehaviour: true,
        skipDuplicateDownloads: true,
      };
      mockChrome.storage.sync.get.mockImplementation((_keys: string[], cb: (r: any) => void) =>
        cb({ settings: stored }),
      );
      mockChrome.tabs.query.mockImplementation((_q: any, cb: (tabs: any[]) => void) => cb([]));

      loadSettings();

      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith(['settings'], expect.any(Function));
      expect(mockChrome.tabs.query).toHaveBeenCalled();
    });
  });

  describe('action mode + badges', () => {
    const load = (settings: Partial<SettingsData>, tabs: Array<{ id?: number; url?: string }>) => {
      mockChrome.storage.sync.get.mockImplementation((_k: string[], cb: (r: any) => void) =>
        cb({ settings: { ...DEFAULT_SETTINGS, ...settings } }),
      );
      mockChrome.tabs.query.mockImplementation((_q: any, cb: (t: any[]) => void) => cb(tabs));
      mockChrome.tabs.sendMessage.mockImplementation((_id: number, _m: string, cb: any) => cb([]));
      loadSettings();
    };

    it('clears badges for every tab when showImageCount is off', () => {
      load({ showImageCount: false }, [{ id: 1 }, { id: 2 }]);
      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 2 });
    });

    it('clears the popup on injectable tabs when the bubble is enabled', () => {
      load({ bubbleEnabled: true }, [{ id: 5, url: 'https://example.com' }]);
      expect(mockChrome.action.setPopup).toHaveBeenCalledWith({ tabId: 5, popup: '' });
    });

    it('keeps the popup on restricted tabs even when the bubble is enabled', () => {
      load({ bubbleEnabled: true }, [{ id: 6, url: 'chrome://extensions' }]);
      expect(mockChrome.action.setPopup).toHaveBeenCalledWith({ tabId: 6, popup: 'popup.html' });
    });

    it('keeps the popup everywhere when the bubble is disabled', () => {
      load({ bubbleEnabled: false }, [{ id: 7, url: 'https://example.com' }]);
      expect(mockChrome.action.setPopup).toHaveBeenCalledWith({ tabId: 7, popup: 'popup.html' });
    });
  });

  describe('originalNameFromUrl', () => {
    it('takes the URL basename without its extension', () => {
      expect(originalNameFromUrl('https://x.com/a/cat.png')).toBe('cat');
      expect(originalNameFromUrl('https://x.com/a/cat.png?x=1')).toBe('cat');
    });

    it('keeps an extension-less basename', () => {
      expect(originalNameFromUrl('https://x.com/a/photo')).toBe('photo');
    });

    it('parses a query-only dynamic CDN URL by its media id', () => {
      expect(originalNameFromUrl('https://pbs.twimg.com/media/HK-Jt?format=jpg&name=orig')).toBe('HK-Jt');
    });

    it('percent-decodes and sanitizes unsafe characters', () => {
      expect(originalNameFromUrl('https://x.com/a/my%20cat.jpg')).toBe('my cat');
      expect(originalNameFromUrl('https://x.com/a/a%3Ab.png')).toBe('ab');
    });

    it('returns null when there is no usable name', () => {
      expect(originalNameFromUrl('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
      expect(originalNameFromUrl('blob:https://x.com/1234')).toBeNull();
      expect(originalNameFromUrl('https://x.com/')).toBeNull();
      expect(originalNameFromUrl('https://x.com/?a=1')).toBeNull();
      expect(originalNameFromUrl('not a url')).toBeNull();
    });
  });
});

describe('resolveOriginalsBatch', () => {
  it('maps each src to its resolved url, skipping failures', async () => {
    const deps = {
      fetch: (async (url: string) =>
        url.includes('syndication')
          ? { ok: true, json: async () => ({ mediaDetails: [{ video_info: { variants: [{ content_type: 'video/mp4', bitrate: 5, url: 'https://video.twimg.com/hi.mp4' }] } }] }) }
          : { ok: false, json: async () => ({}) }) as unknown as typeof fetch,
    };
    const out = await resolveOriginalsBatch([
      { src: 'poster.jpg', hint: { platform: 'twitter', id: '1' } },
      { src: 'thumb.jpg', hint: { platform: 'wallhaven', id: 'x' } }, // 401 -> skipped
    ], deps);
    expect(out).toEqual({ 'poster.jpg': { url: 'https://video.twimg.com/hi.mp4' } });
  });

  it('prefers a sniffed mp4 over the network for a twitter video poster', async () => {
    const fetchMock = vi.fn();
    const sniffed = new Map([['999', { url: 'https://video.twimg.com/orig.mp4' }]]);
    const src = 'https://pbs.twimg.com/amplify_video_thumb/999/img/x.jpg';
    const out = await resolveOriginalsBatch(
      [{ src, hint: { platform: 'twitter', id: '1' } }],
      { fetch: fetchMock as unknown as typeof fetch },
      sniffed,
    );
    expect(out).toEqual({ [src]: { url: 'https://video.twimg.com/orig.mp4' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to syndication when the poster media id was not sniffed', async () => {
    const deps = {
      fetch: (async () => ({ ok: true, json: async () => ({ mediaDetails: [{ video_info: { variants: [{ content_type: 'video/mp4', bitrate: 5, url: 'https://video.twimg.com/net.mp4' }] } }] }) })) as unknown as typeof fetch,
    };
    const src = 'https://pbs.twimg.com/amplify_video_thumb/424242/img/x.jpg';
    const out = await resolveOriginalsBatch(
      [{ src, hint: { platform: 'twitter', id: '1' } }],
      deps,
      new Map(), // empty sniffer map
    );
    expect(out).toEqual({ [src]: { url: 'https://video.twimg.com/net.mp4' } });
  });

  it('dedupes multiple photo hints for the same status into one tweet-result fetch', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      mediaDetails: [
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/PHOTO_A.jpg' },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/PHOTO_B.jpg' },
      ],
    })));
    const out = await resolveOriginalsBatch(
      [
        { src: 'https://x.com/u/status/5/photo/1', hint: { platform: 'twitter', id: 'photo 5 1' } },
        { src: 'https://x.com/u/status/5/photo/2', hint: { platform: 'twitter', id: 'photo 5 2' } },
      ],
      { fetch: fetchMock as unknown as typeof fetch },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('tweet-result?id=5');
    expect(out).toEqual({
      'https://x.com/u/status/5/photo/1': { url: 'https://pbs.twimg.com/media/PHOTO_A.jpg?name=orig' },
      'https://x.com/u/status/5/photo/2': { url: 'https://pbs.twimg.com/media/PHOTO_B.jpg?name=orig' },
    });
  });

  it('control: photo hints for DIFFERENT statuses each still fetch (no cross-status dedupe)', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const sid = new URL(url).searchParams.get('id');
      return new Response(JSON.stringify({
        mediaDetails: [{ type: 'photo', media_url_https: `https://pbs.twimg.com/media/PHOTO_${sid}.jpg` }],
      }));
    });
    const out = await resolveOriginalsBatch(
      [
        { src: 'https://x.com/u/status/5/photo/1', hint: { platform: 'twitter', id: 'photo 5 1' } },
        { src: 'https://x.com/u/status/6/photo/1', hint: { platform: 'twitter', id: 'photo 6 1' } },
      ],
      { fetch: fetchMock as unknown as typeof fetch },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out).toEqual({
      'https://x.com/u/status/5/photo/1': { url: 'https://pbs.twimg.com/media/PHOTO_5.jpg?name=orig' },
      'https://x.com/u/status/6/photo/1': { url: 'https://pbs.twimg.com/media/PHOTO_6.jpg?name=orig' },
    });
  });
});

describe('X_MEDIA_SEEN sniffer store + resolve wiring', () => {
  it('stores host-pinned sniffed mp4s per tab and resolves twitter videos from that tab without the network', async () => {
    messageHandler(
      { type: 'X_MEDIA_SEEN', pairs: [['777', { url: 'https://video.twimg.com/good.mp4' }], ['888', { url: 'https://evil.com/bad.mp4' }]] },
      { tab: { id: 7 } },
      vi.fn(),
    );

    const src = 'https://pbs.twimg.com/amplify_video_thumb/777/img/a.jpg';
    const sendResponse = vi.fn();
    messageHandler(
      { type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] },
      { tab: { id: 7 } }, // same tab → uses its sniffed map
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ resolved: { [src]: { url: 'https://video.twimg.com/good.mp4' } } });
  });

  it('stores a sniffed HLS-only master and resolves the twitter video to a capturable stream', async () => {
    messageHandler(
      { type: 'X_MEDIA_SEEN', pairs: [['654', { url: 'https://video.twimg.com/654/pl.m3u8', hls: true }]] },
      { tab: { id: 9 } },
      vi.fn(),
    );
    const src = 'https://pbs.twimg.com/amplify_video_thumb/654/img/a.jpg';
    const sendResponse = vi.fn();
    messageHandler(
      { type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] },
      { tab: { id: 9 } },
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ resolved: { [src]: { url: 'https://video.twimg.com/654/pl.m3u8', hls: true } } });
  });
});

describe('sniffer cap eviction + no-sender-tab resolve fallback', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    (chrome.tabs.query as Mock).mockReset().mockResolvedValue([]);
  });

  it('evicts the oldest sniffed entry once the per-tab cap (800) is exceeded, and falls back to the network for it', async () => {
    const TAB = 700;
    const pairs = Array.from({ length: 800 }, (_, i) => [String(i + 1), { url: `https://video.twimg.com/${i + 1}.mp4` }]);
    messageHandler({ type: 'X_MEDIA_SEEN', pairs }, { tab: { id: TAB } }, vi.fn());
    messageHandler({ type: 'X_MEDIA_SEEN', pairs: [['801', { url: 'https://video.twimg.com/801.mp4' }]] }, { tab: { id: TAB } }, vi.fn());

    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const realFetch = (global as unknown as { fetch: typeof fetch }).fetch;
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    const kept = 'https://pbs.twimg.com/amplify_video_thumb/801/img/a.jpg';
    const evicted = 'https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg';
    const sendResponse = vi.fn();
    messageHandler(
      {
        type: 'RESOLVE_ORIGINALS',
        hints: [
          { src: kept, hint: { platform: 'twitter', id: 'k' } },
          { src: evicted, hint: { platform: 'twitter', id: 'e' } },
        ],
      },
      { tab: { id: TAB } },
      sendResponse,
    );
    await flush();

    const { resolved } = sendResponse.mock.calls[0][0];
    expect(resolved[kept]).toEqual({ url: 'https://video.twimg.com/801.mp4' });
    expect(resolved[evicted]).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ redirect: 'error' }));
    (global as unknown as { fetch: unknown }).fetch = realFetch;
  });

  it('resolves against the ACTIVE tab\'s sniffed media when the request carries no sender tab (popup)', async () => {
    messageHandler({ type: 'X_MEDIA_SEEN', pairs: [['321', { url: 'https://video.twimg.com/active.mp4' }]] }, { tab: { id: 5 } }, vi.fn());
    (chrome.tabs.query as Mock).mockReset().mockImplementation((_q, cb: (t: Array<{ id: number }>) => void) => cb([{ id: 5 }]));

    const src = 'https://pbs.twimg.com/amplify_video_thumb/321/img/a.jpg';
    const sendResponse = vi.fn();
    messageHandler({ type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] }, {}, sendResponse);
    await flush();

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true }, expect.any(Function));
    expect(sendResponse).toHaveBeenCalledWith({ resolved: { [src]: { url: 'https://video.twimg.com/active.mp4' } } });
  });

  it('dedups repeated srcs in a RESOLVE_ORIGINALS batch (one resolved entry per unique src)', async () => {
    messageHandler({ type: 'X_MEDIA_SEEN', pairs: [['246', { url: 'https://video.twimg.com/dup.mp4' }]] }, { tab: { id: 61 } }, vi.fn());
    const src = 'https://pbs.twimg.com/amplify_video_thumb/246/img/a.jpg';
    const sendResponse = vi.fn();
    messageHandler(
      {
        type: 'RESOLVE_ORIGINALS',
        hints: [
          { src, hint: { platform: 'twitter', id: '1' } },
          { src, hint: { platform: 'twitter', id: '1' } }, // duplicate src → filtered before resolving
        ],
      },
      { tab: { id: 61 } },
      sendResponse,
    );
    await flush();
    const { resolved } = sendResponse.mock.calls[0][0];
    expect(Object.keys(resolved)).toEqual([src]);
    expect(resolved[src]).toEqual({ url: 'https://video.twimg.com/dup.mp4' });
  });
});

describe('GET_DOWNLOADED_SRCS handler', () => {
  it('responds with only the srcs whose downloaded file still exists on disk', async () => {
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({
      downloadHistory: [
        { src: 'https://c/keep.jpg', time: 2, downloadId: 10, filename: 'k', kind: 'image', type: 'jpeg', sourcePageUrl: 'p' },
        { src: 'https://c/gone.jpg', time: 1, downloadId: 20, filename: 'g', kind: 'image', type: 'jpeg', sourcePageUrl: 'p' },
      ],
    });
    (chrome.downloads.search as Mock).mockReset().mockResolvedValue([
      { id: 10, exists: true },
      { id: 20, exists: false }, // deleted/moved since download
    ]);
    const sendResponse = vi.fn();
    const async = messageHandler({ type: 'GET_DOWNLOADED_SRCS' }, {}, sendResponse);
    expect(async).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith(['https://c/keep.jpg']);
  });

  it('responds with [] (never leaves the port open) when history/search rejects', async () => {
    (chrome.storage.local.get as Mock).mockReset().mockRejectedValue(new Error('storage error'));
    const sendResponse = vi.fn();
    const async = messageHandler({ type: 'GET_DOWNLOADED_SRCS' }, {}, sendResponse);
    expect(async).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith([]);
  });
});

describe('downloadAndRecord', () => {
  beforeEach(() => {
    (chrome.downloads.download as Mock).mockReset();
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());
  const img = (src: string) =>
    ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const });

  it('records one entry per successful download with the source page', async () => {
    (chrome.downloads.download as Mock).mockImplementation((_opts, cb) => cb(42));
    await downloadAndRecord([img('https://c/a.jpg')], { url: 'https://page', title: 'T' });
    const written = (chrome.storage.local.set as Mock).mock.calls[0][0].downloadHistory;
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ src: 'https://c/a.jpg', kind: 'image', sourcePageUrl: 'https://page', sourcePageTitle: 'T', downloadId: 42 });
  });

  it('passes the settings-derived filename, saveAs, and conflictAction to chrome.downloads', async () => {
    (chrome.downloads.download as Mock).mockImplementation((_opts, cb) => cb(1));
    await downloadAndRecord([img('https://c/a.jpg')], undefined);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://c/a.jpg', filename: 'image_1.jpg', saveAs: false, conflictAction: 'uniquify' }),
      expect.any(Function),
    );
  });

  it('does not record a failed download', async () => {
    (chrome.downloads.download as Mock).mockImplementation((_opts, cb) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'x' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
    });
    await downloadAndRecord([img('https://c/b.jpg')], undefined);
    expect(chrome.storage.local.set as Mock).not.toHaveBeenCalled();
  });

  it('#284 (I5): schedules a sidecar for the keyboard/context-menu surface when metadataSidecar is on', async () => {
    (scheduleSidecar as Mock).mockClear();
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { metadataSidecar: true } }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(50));

    await downloadAndRecord([img('https://c/a.jpg?token=SECRET')], { url: 'https://p', title: 'T' });

    expect(scheduleSidecar).toHaveBeenCalledWith(50, 'image_1.jpg', expect.stringContaining('"pageUrl": "https://p"'));
    const json = (scheduleSidecar as Mock).mock.calls[0][2] as string;
    expect(json).not.toContain('SECRET');

    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: {} }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('#284: does NOT schedule a sidecar when metadataSidecar is off (default)', async () => {
    (scheduleSidecar as Mock).mockClear();
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(1));
    await downloadAndRecord([img('https://c/a.jpg')], undefined);
    expect(scheduleSidecar).not.toHaveBeenCalled();
  });

  it('skips already-downloaded srcs when skipDuplicates is set', async () => {
    vi.spyOn(dlKeys, 'downloadedOnDiskKeys').mockResolvedValue(SrcKeySet.from(['https://x/a.png']));
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(11));
    const result = await downloadAndRecord(
      [img('https://x/a.png'), img('https://x/b.png')],
      { url: 'https://p' },
      { skipDuplicates: true },
    );
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(1);
  });

  it('does not skip when skipDuplicates is absent (default)', async () => {
    const spy = vi.spyOn(dlKeys, 'downloadedOnDiskKeys');
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(11));
    const result = await downloadAndRecord([img('https://x/a.png')], { url: 'https://p' });
    expect(spy).not.toHaveBeenCalled();
    expect(result.skipped).toBe(0);
  });
});

describe('downloadStatusMessage', () => {
  it('mentions skipped duplicates in the status message', () => {
    expect(downloadStatusMessage({ total: 2, succeeded: 2, failed: 0, skipped: 3 }))
      .toBe('Downloaded 2 files. (3 skipped — already saved)');
    expect(downloadStatusMessage({ total: 0, succeeded: 0, failed: 0, skipped: 4 }))
      .toBe('Nothing new — 4 already saved.');
  });
});

describe('runtime message router — history actions', () => {
  const dispatch = (msg: unknown) => messageHandler(msg, {}, vi.fn());

  beforeEach(() => {
    (chrome.downloads.open as Mock).mockReset();
    (chrome.downloads.show as Mock).mockReset();
    (chrome.tabs.create as Mock).mockReset();
  });

  it('opens a downloaded file by id', () => {
    dispatch({ type: 'OPEN_DOWNLOAD_FILE', downloadId: 7 });
    expect(chrome.downloads.open).toHaveBeenCalledWith(7);
  });

  it('reveals a downloaded file in its folder', () => {
    dispatch({ type: 'SHOW_DOWNLOAD', downloadId: 9 });
    expect(chrome.downloads.show).toHaveBeenCalledWith(9);
  });

  it('opens a source URL in a new tab', () => {
    dispatch({ type: 'OPEN_URL', url: 'https://c/a.jpg' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://c/a.jpg' });
  });

  it('refuses to open a non-http OPEN_URL (javascript:/data:)', () => {
    dispatch({ type: 'OPEN_URL', url: 'javascript:alert(1)' });
    dispatch({ type: 'OPEN_URL', url: 'data:text/html,<script>1</script>' });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('clears history in the background on CLEAR_HISTORY', async () => {
    (chrome.storage.local.set as Mock).mockClear().mockResolvedValue(undefined);
    dispatch({ type: 'CLEAR_HISTORY' });
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ downloadHistory: [] });
  });

  it('removes one entry in the background on REMOVE_HISTORY_ENTRY', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({
      downloadHistory: [{ src: 'a', time: 1 }, { src: 'b', time: 2 }],
    });
    (chrome.storage.local.set as Mock).mockClear().mockResolvedValue(undefined);
    dispatch({ type: 'REMOVE_HISTORY_ENTRY', src: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ downloadHistory: [{ src: 'b', time: 2 }] });
  });
});

describe('DOWNLOAD_IMAGES — settings gate (no ephemeral-worker default-settings race)', () => {
  const img = (src: string): ImageInfo =>
    ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' });

  it('waits for settings to load, then queues + dispatches into the user subfolder', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_keys, cb) => cb({ settings: { downloadPath: 'Pics' } }));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as Mock).mockImplementation(async (k: string) => (k in local ? { [k]: local[k] } : {}));
    (chrome.storage.local.set as Mock).mockImplementation(async (o: Record<string, unknown>) => { Object.assign(local, o); });

    messageHandler(
      { type: 'DOWNLOAD_IMAGES', images: [img('https://c/a.jpg')], sourcePage: undefined },
      {},
      vi.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Pics/image_1.jpg' }),
      expect.any(Function),
    );
    expect((local.downloadQueue as { items: { status: string }[] }).items[0].status).toBe('active');
  });

  it('attaches a metadata sidecar to the queued item when metadataSidecar is on (#284)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_keys, cb) => cb({ settings: { metadataSidecar: true } }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as Mock).mockImplementation(async (k: string) => (k in local ? { [k]: local[k] } : {}));
    (chrome.storage.local.set as Mock).mockImplementation(async (o: Record<string, unknown>) => { Object.assign(local, o); });

    messageHandler(
      { type: 'DOWNLOAD_IMAGES', images: [img('https://c/a.jpg?token=SECRET')], sourcePage: { url: 'https://site/page', title: 'Page' } },
      {},
      vi.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect((chrome.downloads.download as Mock).mock.calls.some((c) => String(c[0].filename).endsWith('.json'))).toBe(false);
    const item = (local.downloadQueue as { items: { sidecar?: string }[] }).items[0];
    expect(item.sidecar).toBeTruthy();
    expect(JSON.parse(item.sidecar!)).toMatchObject({ pageUrl: 'https://site/page', pageTitle: 'Page' });
    expect(item.sidecar).not.toContain('SECRET');
  });

  it("#283: a multi-tab item's sidecar records ITS OWN source page, not the active-tab batch default", async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_keys, cb) => cb({ settings: { metadataSidecar: true } }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as Mock).mockImplementation(async (k: string) => (k in local ? { [k]: local[k] } : {}));
    (chrome.storage.local.set as Mock).mockImplementation(async (o: Record<string, unknown>) => { Object.assign(local, o); });

    messageHandler(
      {
        type: 'DOWNLOAD_IMAGES',
        images: [{ ...img('https://c/fromB.jpg'), sourcePage: { url: 'https://tab-b/album', title: 'Tab B' } }],
        sourcePage: { url: 'https://tab-a/active', title: 'Tab A' },
      },
      {},
      vi.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));

    const item = (local.downloadQueue as { items: { sidecar?: string }[] }).items[0];
    expect(JSON.parse(item.sidecar!)).toMatchObject({ pageUrl: 'https://tab-b/album', pageTitle: 'Tab B' });
  });

  it('attaches no sidecar to the queued item when metadataSidecar is off (default)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_keys, cb) => cb({ settings: { metadataSidecar: false } }));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as Mock).mockImplementation(async (k: string) => (k in local ? { [k]: local[k] } : {}));
    (chrome.storage.local.set as Mock).mockImplementation(async (o: Record<string, unknown>) => { Object.assign(local, o); });

    messageHandler({ type: 'DOWNLOAD_IMAGES', images: [img('https://c/a.jpg')], sourcePage: undefined }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    expect((chrome.downloads.download as Mock).mock.calls.some((c) => String(c[0].filename).endsWith('.json'))).toBe(false);
    const item = (local.downloadQueue as { items: { sidecar?: string }[] }).items[0];
    expect(item?.sidecar).toBeUndefined();
  });
});

describe('DOWNLOAD_ZIP — archive bytes → data URL → chrome.downloads', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_keys, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset();
  });

  it('downloads a base64 data: URL with the given filename, saveAs, and uniquify', async () => {
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(5));
    const sendResponse = vi.fn();
    const b64 = 'UEsDBA==';

    const handled = messageHandler(
      { type: 'DOWNLOAD_ZIP', b64, filename: 'example.com-media-2026-07-06.zip' },
      {},
      sendResponse,
    );
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'data:application/zip;base64,UEsDBA==',
        filename: 'example.com-media-2026-07-06.zip',
        saveAs: false,
        conflictAction: 'uniquify',
      }),
      expect.any(Function),
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Saved example.com-media-2026-07-06.zip.' });
  });

  it('reports an error when chrome cannot start the download', async () => {
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'boom' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
    });
    const sendResponse = vi.fn();
    messageHandler({ type: 'DOWNLOAD_ZIP', b64: 'AQ==', filename: 'x.zip' }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: "Couldn't save x.zip." });
  });
});

describe('SET_SETTINGS (serialized settings writer)', () => {
  it('deep-merges a partial bubblePosition patch, preserving the stored drag-only x/y + panelPoint', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { bubblePosition: { corner: 'bottom-right', x: 99, y: 88 }, bubblePanelPoint: { x: 77, y: 66 } } }));
    let written: Record<string, unknown> | undefined;
    (chrome.storage.sync.set as Mock).mockReset().mockImplementation((obj, cb) => { written = obj.settings; cb?.(); });

    messageHandler({ type: 'SET_SETTINGS', patch: { bubblePosition: { corner: 'top-left' }, bubblePanelPlacement: 'center' } }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    expect(written?.bubblePosition).toEqual({ corner: 'top-left', x: 99, y: 88 });
    expect(written?.bubblePanelPoint).toEqual({ x: 77, y: 66 });
    expect(written?.bubblePanelPlacement).toBe('center');
  });

  it('applies a full bubblePosition patch (a bubble FAB drag) replacing x/y', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) =>
      cb({ settings: { bubblePosition: { corner: 'bottom-right', x: 99, y: 88 } } }));
    let written: Record<string, unknown> | undefined;
    (chrome.storage.sync.set as Mock).mockReset().mockImplementation((obj, cb) => { written = obj.settings; cb?.(); });

    messageHandler({ type: 'SET_SETTINGS', patch: { bubblePosition: { corner: 'bottom-right', x: 5, y: 6 } } }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    expect(written?.bubblePosition).toEqual({ corner: 'bottom-right', x: 5, y: 6 });
  });

  it('sanitizes a corrupt minimumImageSize patch instead of persisting it verbatim', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: {} }));
    let written: Record<string, unknown> | undefined;
    (chrome.storage.sync.set as Mock).mockReset().mockImplementation((obj, cb) => { written = obj.settings; cb?.(); });

    messageHandler({ type: 'SET_SETTINGS', patch: { minimumImageSize: 'abc' as never } }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    expect(written?.minimumImageSize).toBe(0);
  });
});

describe('context menu', () => {
  const info = (over: Partial<chrome.contextMenus.OnClickData>): chrome.contextMenus.OnClickData =>
    ({ menuItemId: '', editable: false, pageUrl: 'https://page', ...over }) as unknown as chrome.contextMenus.OnClickData;
  const tab = (over: Partial<chrome.tabs.Tab>): chrome.tabs.Tab => (over as unknown as chrome.tabs.Tab);

  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ downloadHistory: [], favourites: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
    (chrome.tabs.sendMessage as Mock).mockReset();
  });

  it('creates the four menu items on setup', () => {
    (chrome.contextMenus.create as Mock).mockClear();
    (chrome.contextMenus.removeAll as Mock).mockImplementation((cb?: () => void) => cb?.());
    setupContextMenus();
    const ids = (chrome.contextMenus.create as Mock).mock.calls.map((c) => c[0].id);
    expect(ids).toEqual(['mbd-download-all', 'mbd-download-image', 'mbd-favourite-image', 'mbd-download-media']);
  });

  it('mediaFromContext upgrades an image, keeps a/v as-is, and skips data: URLs', () => {
    expect(mediaFromContext(info({ srcUrl: 'data:image/png;base64,AAAA', mediaType: 'image' }))).toBeNull();
    expect(mediaFromContext(info({ srcUrl: 'https://cdn/a.jpg', mediaType: 'image' }))).toMatchObject({ kind: 'image' });
    expect(mediaFromContext(info({ srcUrl: 'https://cdn/clip.mp4', mediaType: 'video' }))).toMatchObject({ kind: 'video', src: 'https://cdn/clip.mp4' });
  });

  it('downloads the single right-clicked image without the size filter', async () => {
    contextMenuHandler(info({ menuItemId: 'mbd-download-image', srcUrl: 'https://cdn/pic.jpg', mediaType: 'image' }), tab({ url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('pic.jpg'), filename: expect.stringMatching(/image_1\.(jpe?g)$/) }),
      expect.any(Function),
    );
  });

  it('download-all collects from the tab and downloads the eligible set', async () => {
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) =>
      cb([{ src: 'https://c/a.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' }]));
    contextMenuHandler(info({ menuItemId: 'mbd-download-all' }), tab({ id: 9, url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(9, 'GET_IMAGES', expect.any(Function));
    expect(chrome.downloads.download).toHaveBeenCalled();
  });

  it('download-all captures HLS/DASH stream items instead of downloading the manifest URL', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { captureHlsStreams: true } }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
    (chrome.offscreen.hasDocument as Mock).mockResolvedValue(false);
    (chrome.offscreen.createDocument as Mock).mockReset().mockResolvedValue(undefined);
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 5, muxedAudio: false,
    } as CaptureRunResult);
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) =>
      cb([
        { src: 'https://c/a.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' },
        { src: 'https://x/m.m3u8', hlsManifest: 'https://x/m.m3u8', type: 'm3u8', kind: 'video', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' },
      ]));
    contextMenuHandler(info({ menuItemId: 'mbd-download-all' }), tab({ id: 9, url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAPTURE_RUN', manifestUrl: 'https://x/m.m3u8', engine: 'hls' }),
    );
    const dlUrls = (chrome.downloads.download as Mock).mock.calls.map((c) => c[0].url);
    expect(dlUrls).toContain('blob:cap');
    expect(dlUrls).not.toContain('https://x/m.m3u8');
  });

  it('download-all excludes pending (unresolved) images and videos from chrome.downloads', async () => {
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) =>
      cb([
        { src: 'https://c/real.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' },
        {
          src: 'https://x.com/u/status/1/photo/1', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0,
          isBase64: false, alt: '', unresolvedImage: true, resolveHint: { platform: 'twitter', id: 'photo 1 1' },
        },
        {
          src: 'https://pbs.twimg.com/poster.jpg', kind: 'video', type: 'mp4', width: 0, height: 0, fileSize: 0,
          isBase64: false, alt: '', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1' },
        },
      ]));
    contextMenuHandler(info({ menuItemId: 'mbd-download-all' }), tab({ id: 9, url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    const dlUrls = (chrome.downloads.download as Mock).mock.calls.map((c) => c[0].url);
    expect(dlUrls.some((u: string) => u.includes('real.jpg'))).toBe(true);
    expect(dlUrls.some((u: string) => u.includes('status/1/photo/1'))).toBe(false);
    expect(dlUrls.some((u: string) => u.includes('poster.jpg'))).toBe(false);
  });

  it('adds the right-clicked image to favourites', async () => {
    contextMenuHandler(info({ menuItemId: 'mbd-favourite-image', srcUrl: 'https://cdn/pic.jpg', mediaType: 'image' }), tab({ url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    const set = (chrome.storage.local.set as Mock).mock.calls.at(-1)?.[0];
    expect(set.favourites[0]).toMatchObject({ src: expect.stringContaining('pic.jpg'), kind: 'image', sourcePageUrl: 'https://page' });
  });
});

describe('DOWNLOAD_TEXT + RESTORE_DATA routers', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb?.(1));
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ downloadHistory: [], favourites: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
  });

  it('DOWNLOAD_TEXT saves a base64 data URL of the text with the given filename + mime', async () => {
    messageHandler({ type: 'DOWNLOAD_TEXT', filename: 'links.txt', text: 'https://a\nhttps://b', mime: 'text/plain' }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    const arg = (chrome.downloads.download as Mock).mock.calls.at(-1)![0];
    expect(arg.filename).toBe('links.txt');
    expect(arg.url.startsWith('data:text/plain;base64,')).toBe(true);
    const decoded = Buffer.from(arg.url.split(',')[1], 'base64').toString('utf8');
    expect(decoded).toBe('https://a\nhttps://b');
  });

  it('RESTORE_DATA replaces favourites and history in storage', async () => {
    messageHandler(
      {
        type: 'RESTORE_DATA',
        favourites: [{ src: 'https://f', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 1 }],
        history: [{ src: 'https://h', filename: 'h.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'p', time: 2 }],
        excluded: [],
      },
      {},
      vi.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));
    const sets = (chrome.storage.local.set as Mock).mock.calls.map((c) => c[0]);
    expect(sets.find((s) => 'favourites' in s).favourites[0].src).toBe('https://f');
    expect(sets.find((s) => 'downloadHistory' in s).downloadHistory[0].src).toBe('https://h');
  });
});

describe('keyboard commands', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb?.(1));
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
    (chrome.tabs.query as Mock).mockReset();
    (chrome.tabs.sendMessage as Mock).mockReset();
  });

  it('download-all-media queries the active tab and downloads its media', async () => {
    (chrome.tabs.query as Mock).mockImplementation((_q, cb) => cb([{ id: 3, url: 'https://page', title: 'T' }]));
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) =>
      cb([{ src: 'https://c/a.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' }]));
    commandHandler('download-all-media');
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, 'GET_IMAGES', expect.any(Function));
    expect(chrome.downloads.download).toHaveBeenCalled();
  });

  it('ignores an unknown command', () => {
    commandHandler('does-not-exist');
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });
});

describe('completion notification', () => {
  const img = (src: string): ImageInfo =>
    ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' });

  beforeEach(() => {
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
    (chrome.notifications.create as Mock).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('fires a toast after a batch when notifyOnComplete is on', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: true } }));
    loadSettings();
    await downloadAndRecord([img('https://c/a.jpg')], undefined);
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'basic', title: 'Media Bulk Downloads', message: 'Downloaded 1 file.' }),
      expect.any(Function),
    );
  });

  it('stays silent when notifyOnComplete is off', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: false } }));
    loadSettings();
    await downloadAndRecord([img('https://c/a.jpg')], undefined);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('swallows a lastError in the notification callback (notifications permission not granted)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: true } }));
    loadSettings();
    (chrome.notifications.create as Mock).mockImplementation((_opts, cb: () => void) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'notifications permission not granted' };
      cb();
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = null;
    });
    await expect(downloadAndRecord([img('https://c/a.jpg')], undefined)).resolves.toMatchObject({ succeeded: 1 });
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Downloaded 1 file.' }),
      expect.any(Function),
    );
  });

  it('fires a "nothing new" toast when a batch is entirely duplicates (total 0, skipped > 0)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: true } }));
    loadSettings();
    vi.spyOn(dlKeys, 'downloadedOnDiskKeys').mockResolvedValue(
      SrcKeySet.from(['https://c/a.jpg', 'https://c/b.jpg']),
    );
    const result = await downloadAndRecord(
      [img('https://c/a.jpg'), img('https://c/b.jpg')],
      undefined,
      { skipDuplicates: true },
    );
    expect(result).toMatchObject({ total: 0, succeeded: 0, failed: 0, skipped: 2 });
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already saved') }),
      expect.any(Function),
    );
  });

  it('stays silent when there is nothing to download and nothing was skipped (total 0, skipped 0)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: true } }));
    loadSettings();
    const result = await downloadAndRecord([], undefined);
    expect(result).toMatchObject({ total: 0, succeeded: 0, failed: 0, skipped: 0 });
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });
});

describe('DOWNLOAD_BYTES router', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb?.(1));
  });

  it('saves a base64 data URL with the given mime and filename', async () => {
    messageHandler(
      { type: 'DOWNLOAD_BYTES', filename: 'cat.png', b64: 'UEsDBA==', mime: 'image/png' },
      {},
      vi.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));
    const arg = (chrome.downloads.download as Mock).mock.calls.at(-1)![0];
    expect(arg.filename).toBe('cat.png');
    expect(arg.url).toBe('data:image/png;base64,UEsDBA==');
    expect(arg.conflictAction).toBe('uniquify');
  });

  it('schedules a metadata sidecar mapped from `source` when metadataSidecar is on (#284, I8)', async () => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { metadataSidecar: true } }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
    (scheduleSidecar as Mock).mockClear();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb?.(88));

    messageHandler(
      {
        type: 'DOWNLOAD_BYTES', filename: 'sub/pic.png', b64: 'AAAA', mime: 'image/png',
        source: {
          src: 'https://cdn/x.webp?token=SECRET', alt: 'a cat', width: 800, height: 600,
          type: 'webp', kind: 'image', ext: 'png', fileSize: 1234,
          sourcePageUrl: 'https://site/p', sourcePageTitle: 'P',
        },
      },
      {},
      vi.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(scheduleSidecar).toHaveBeenCalledWith(88, 'sub/pic.png', expect.any(String));
    const json = JSON.parse((scheduleSidecar as Mock).mock.calls[0][2] as string);
    expect(json).toMatchObject({ alt: 'a cat', width: 800, height: 600, format: 'png', pageUrl: 'https://site/p', pageTitle: 'P' });
    expect((scheduleSidecar as Mock).mock.calls[0][2]).not.toContain('SECRET');

    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('CAPTURE_STREAM', () => {
  const item = { src: 'https://x/m.m3u8', hlsManifest: 'https://x/m.m3u8', type: 'm3u8', kind: 'video', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' };
  const sourcePage = { url: 'https://x/watch', title: 'X' };

  beforeEach(() => {
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.offscreen.hasDocument as Mock).mockResolvedValue(false);
    (chrome.offscreen.createDocument as Mock).mockReset().mockResolvedValue(undefined);
    (chrome.downloads.download as Mock).mockReset();
  });

  it('ensures the offscreen doc, downloads the returned blob, and responds with a status', async () => {
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 9, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(123));
    const sendResponse = vi.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', manifestUrl: item.hlsManifest, quality: 720, maxBytes: 1024 * 1024 * 1024 }));
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'blob:cap', conflictAction: 'uniquify', filename: expect.stringMatching(/\.mp4$/) }),
      expect.any(Function),
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: expect.stringContaining('9 segments') });
    expect(sendResponse).toHaveBeenCalledWith({ status: expect.stringContaining('(video + audio)') });
  });

  it('forwards audioOnly to the offscreen engine and labels the result "(audio only)" (I7)', async () => {
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'm4a', mime: 'audio/mp4', segmentCount: 5, muxedAudio: false,
    } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(7));
    const sendResponse = vi.fn();

    messageHandler(
      { type: 'CAPTURE_STREAM', runId: 'run-audio', manifestUrl: item.hlsManifest, item, sourcePage, audioOnly: true },
      {},
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', audioOnly: true }));
    expect(sendResponse).toHaveBeenCalledWith({ status: expect.stringContaining('(audio only)') });
  });

  it('records the captured stream to history (downloaded mark + dedup, previously skipped)', async () => {
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 3, muxedAudio: false,
    } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(321));
    (chrome.storage.local.get as Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const written = (chrome.storage.local.set as Mock).mock.calls.at(-1)?.[0]?.downloadHistory;
    expect(written).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: 'https://x/m.m3u8', downloadId: 321, kind: 'video' }),
    ]));
  });

  it('forwards CAPTURE_RUN with engine:dash for an mpd item', async () => {
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 4, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(123));
    const dashItem = { ...item, type: 'mpd' };
    const sendResponse = vi.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: dashItem.hlsManifest, item: dashItem, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', engine: 'dash' }));
  });

  it('forwards CAPTURE_RUN with engine:hls for an m3u8 item', async () => {
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 9, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(123));
    const sendResponse = vi.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', engine: 'hls' }));
  });

  it('maps the global streamQuality setting into CAPTURE_RUN.quality (#288)', async () => {
    for (const [setting, quality] of [['480', 480], ['best', 'highest'], ['worst', 'lowest']] as const) {
      (chrome.runtime.sendMessage as Mock).mockReset().mockResolvedValue({
        ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
      } as CaptureRunResult);
      (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(1));
      (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { streamQuality: setting } }));
      loadSettings();
      await new Promise((r) => setTimeout(r, 0));

      messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, vi.fn());
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', quality }));
    }
  });

  it('lets a per-item quality override beat the global streamQuality in CAPTURE_RUN (#314)', async () => {
    (chrome.runtime.sendMessage as Mock).mockReset().mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
    } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(1));
    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: { streamQuality: '480' } }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-y', manifestUrl: item.hlsManifest, item, sourcePage, quality: 720 }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', quality: 720 }));
  });

  it('tolerates the concurrent-create race: createDocument rejects but a document now exists, so capture still proceeds', async () => {
    (chrome.offscreen.hasDocument as Mock).mockReset()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (chrome.offscreen.createDocument as Mock).mockReset()
      .mockRejectedValue(new Error('Only a single offscreen document may be created'));
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 9, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(123));
    const sendResponse = vi.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN' }));
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'blob:cap', conflictAction: 'uniquify' }),
      expect.any(Function),
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: expect.stringContaining('9 segments') });
  });

  it('reports a capture failure (not a throw) when createDocument keeps rejecting and no document ever appears', async () => {
    (chrome.offscreen.hasDocument as Mock).mockReset().mockResolvedValue(false);
    (chrome.offscreen.createDocument as Mock).mockReset()
      .mockRejectedValue(new Error('Only a single offscreen document may be created'));
    const sendResponse = vi.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(sendResponse).toHaveBeenCalledWith({ status: 'Couldn’t capture the stream.' });
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it('does not re-create the offscreen doc when one already exists', async () => {
    (chrome.offscreen.hasDocument as Mock).mockResolvedValue(true);
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false } as CaptureRunResult);
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(1));

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('responds with the mapped error and does not download when the engine fails', async () => {
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: false, code: 'too-large' } as CaptureRunResult);
    const sendResponse = vi.fn();
    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: expect.stringMatching(/1 GB/), refusal: { code: 'too-large' } });
  });

  describe('CAPTURE_PROGRESS relay', () => {
    beforeEach(() => {
      (chrome.tabs.sendMessage as Mock).mockReset().mockResolvedValue(undefined);
    });

    it('forwards progress to the tab that started the capture', async () => {
      (chrome.runtime.sendMessage as Mock).mockResolvedValue({
        ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
      } as CaptureRunResult);
      (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(1));

      messageHandler(
        { type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage },
        { tab: { id: 42 } },
        vi.fn(),
      );
      messageHandler({ type: 'CAPTURE_PROGRESS', runId: 'run-x', done: 3, total: 10 }, {}, vi.fn());

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, expect.objectContaining({ type: 'CAPTURE_PROGRESS' }));

      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    it('routes each concurrent capture\'s progress to its own tab (no cross-talk)', async () => {
      (chrome.runtime.sendMessage as Mock).mockResolvedValue({
        ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
      } as CaptureRunResult);
      (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(1));

      messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-A', manifestUrl: item.hlsManifest, item, sourcePage }, { tab: { id: 11 } }, vi.fn());
      messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-B', manifestUrl: item.hlsManifest, item, sourcePage }, { tab: { id: 22 } }, vi.fn());
      messageHandler({ type: 'CAPTURE_PROGRESS', runId: 'run-B', done: 1, total: 2 }, {}, vi.fn());
      messageHandler({ type: 'CAPTURE_PROGRESS', runId: 'run-A', done: 2, total: 2 }, {}, vi.fn());

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(22, expect.objectContaining({ runId: 'run-B' }));
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(11, expect.objectContaining({ runId: 'run-A' }));
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(11, expect.objectContaining({ runId: 'run-B' }));

      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    it('does not forward when no capture is active (popup capture, whose sender.tab is undefined)', async () => {
      (chrome.runtime.sendMessage as Mock).mockResolvedValue({
        ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
      } as CaptureRunResult);
      (chrome.downloads.download as Mock).mockImplementation((_o, cb) => cb(1));

      messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, vi.fn());
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      messageHandler({ type: 'CAPTURE_PROGRESS', done: 1, total: 10 }, {}, vi.fn());

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });
});

describe('EXCLUDED routing', () => {
  it('ADD_EXCLUDED calls addExcluded', () => {
    messageHandler({ type: 'ADD_EXCLUDED', entry: { value: 'https://x/a.png', kind: 'url', time: 1 } }, {}, vi.fn());
    expect(excludedMod.addExcluded).toHaveBeenCalledWith({ value: 'https://x/a.png', kind: 'url', time: 1 });
  });
  it('REMOVE_EXCLUDED calls removeExcluded with kind+value', () => {
    messageHandler({ type: 'REMOVE_EXCLUDED', kind: 'host', value: 'cdn.ads.com' }, {}, vi.fn());
    expect(excludedMod.removeExcluded).toHaveBeenCalledWith('host', 'cdn.ads.com');
  });
  it('CLEAR_EXCLUDED calls clearExcluded', () => {
    messageHandler({ type: 'CLEAR_EXCLUDED' }, {}, vi.fn());
    expect(excludedMod.clearExcluded).toHaveBeenCalled();
  });
});

describe('excluded blocklist reaches the background download paths', () => {
  let localStore: Record<string, unknown>;

  const adImage: ImageInfo = { src: 'https://cdn.ads.com/ad.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' };
  const goodImage: ImageInfo = { src: 'https://c/good.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' };

  beforeEach(() => {
    localStore = {};
    (chrome.storage.local.get as Mock).mockReset().mockImplementation(
      (keys?: string | string[] | Record<string, unknown> | null) => {
        if (keys == null) return Promise.resolve({ ...localStore });
        if (typeof keys === 'string') return Promise.resolve(keys in localStore ? { [keys]: localStore[keys] } : {});
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {};
          keys.forEach((k) => { if (k in localStore) out[k] = localStore[k]; });
          return Promise.resolve(out);
        }
        const defaults = keys as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        Object.keys(defaults).forEach((k) => { out[k] = k in localStore ? localStore[k] : defaults[k]; });
        return Promise.resolve(out);
      },
    );
    (chrome.storage.local.set as Mock).mockReset().mockImplementation((items: Record<string, unknown>) => {
      Object.assign(localStore, items);
      return Promise.resolve(undefined);
    });

    (chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    (chrome.tabs.sendMessage as Mock).mockReset();
  });

  afterEach(async () => {
    storageChangedHandler({ excluded: { newValue: [] } }, 'local');
    await new Promise((r) => setTimeout(r, 0));
  });

  /** Seeds the blocklist and fires the onChanged listener the same way a real
   *  ADD_EXCLUDED write would, then waits for reloadExcluded's async read. */
  const seedExcludedHost = async (host: string) => {
    await chrome.storage.local.set({ excluded: [{ value: host, kind: 'host', time: 1 }] });
    storageChangedHandler({ excluded: { newValue: [{ value: host, kind: 'host', time: 1 }] } }, 'local');
    await new Promise((r) => setTimeout(r, 0));
  };

  it('"download all media on this page" (context menu) skips a blocklisted host but downloads the rest', async () => {
    await seedExcludedHost('cdn.ads.com');
    (chrome.tabs.sendMessage as Mock).mockImplementation((_id, _msg, cb) => cb([adImage, goodImage]));

    contextMenuHandler(
      { menuItemId: 'mbd-download-all', editable: false, pageUrl: 'https://page' },
      { id: 9, url: 'https://page', title: 'T' },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://c/good.jpg' }),
      expect.any(Function),
    );
    expect(chrome.downloads.download).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.ads.com/ad.jpg' }),
      expect.any(Function),
    );
  });

  it('DOWNLOAD_IMAGES message handler also skips a blocklisted host (defense in depth)', async () => {
    await seedExcludedHost('cdn.ads.com');

    messageHandler({ type: 'DOWNLOAD_IMAGES', images: [adImage, goodImage], sourcePage: undefined }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://c/good.jpg' }),
      expect.any(Function),
    );
    expect(chrome.downloads.download).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.ads.com/ad.jpg' }),
      expect.any(Function),
    );
  });
});

describe('QUEUE_* routing → download queue', () => {
  const saved = global.chrome;
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async (k: string) => (k in store ? { [k]: store[k] } : {})),
          set: vi.fn(async (o: Record<string, unknown>) => { Object.assign(store, o); }),
        },
      },
      downloads: {
        download: vi.fn(),
        open: vi.fn(),
        search: vi.fn(async () => []),
        onChanged: { addListener: vi.fn() },
      },
      runtime: { lastError: undefined },
    } as unknown as typeof chrome;
  });

  afterEach(() => { global.chrome = saved; });

  it('QUEUE_PAUSE routes to the dispatcher and flips paused in storage', async () => {
    const respond = vi.fn();
    const res = messageHandler({ type: 'QUEUE_PAUSE' }, {}, respond);
    expect(res).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect((store.downloadQueue as { paused?: boolean } | undefined)?.paused).toBe(true);
    expect(respond).toHaveBeenCalledWith({ status: 'success', message: 'Paused' });
  });

  it('QUEUE_RESUME clears paused', async () => {
    store.downloadQueue = { items: [], paused: true };
    messageHandler({ type: 'QUEUE_RESUME' }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    expect((store.downloadQueue as { paused?: boolean }).paused).toBe(false);
  });

  it('QUEUE_RETRY with referer re-queues a hotlink-failed item with the rewrite armed', async () => {
    store.downloadQueue = { paused: false, items: [
      { id: 'h', url: 'https://cdn/x.jpg', filename: 'x.jpg', status: 'failed', attempts: 0, error: 'SERVER_FORBIDDEN', hotlink: true, readyAt: 0, addedAt: 0 },
    ] };
    messageHandler({ type: 'QUEUE_RETRY', id: 'h', referer: true }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    const item = (store.downloadQueue as { items: { status: string; useReferer?: boolean; hotlink?: boolean }[] }).items[0];
    expect(item.useReferer).toBe(true);
    expect(item.hotlink).toBeUndefined();
    expect(['queued', 'active']).toContain(item.status);
  });

  it('QUEUE_CLEAR clears finished (done/failed) items, keeping live ones', async () => {
    store.downloadQueue = { paused: false, items: [
      { id: 'a', url: 'u', filename: 'a', status: 'done', attempts: 0, readyAt: 0, addedAt: 0 },
      { id: 'b', url: 'u', filename: 'b', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 1 },
    ] };
    const respond = vi.fn();
    messageHandler({ type: 'QUEUE_CLEAR' }, {}, respond);
    await new Promise((r) => setTimeout(r, 0));
    const s = store.downloadQueue as { items: { id: string }[] };
    expect(s.items.map((i) => i.id)).toEqual(['b']);
    expect(respond).toHaveBeenCalledWith({ status: 'success', message: 'Cleared' });
  });

  it('QUEUE_OPEN opens a done item via chrome.downloads.open', async () => {
    store.downloadQueue = { paused: false, items: [
      { id: 'a', url: 'u', filename: 'a', status: 'done', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 42 },
    ] };
    const respond = vi.fn();
    messageHandler({ type: 'QUEUE_OPEN', id: 'a' }, {}, respond);
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.downloads.open).toHaveBeenCalledWith(42);
    expect(respond).toHaveBeenCalledWith({ status: 'success', message: 'Opened' });
  });

  it('QUEUE_RETRY id:"all-failed" re-queues all failed items', async () => {
    store.downloadQueue = { paused: false, items: [
      { id: 'a', url: 'u', filename: 'a', status: 'failed', attempts: 3, error: 'x', readyAt: 0, addedAt: 0 },
    ] };
    messageHandler({ type: 'QUEUE_RETRY', id: 'all-failed' }, {}, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    const item = (store.downloadQueue as { items: { status: string }[] }).items[0];
    expect(['queued', 'active']).toContain(item.status);
  });
});

describe('settings sync → on-page bubble broadcast', () => {
  it('pushes SETTINGS_CHANGED to every tab when settings change via storage.onChanged sync (remote-device sync)', async () => {
    (chrome.tabs.query as Mock).mockReset().mockImplementation(
      (_q: unknown, cb: (tabs: { id: number }[]) => void) => cb([{ id: 11 }, { id: 22 }]),
    );
    (chrome.tabs.sendMessage as Mock).mockReset().mockReturnValue(Promise.resolve());

    storageChangedHandler({ settings: { newValue: { ...DEFAULT_SETTINGS, bubbleEnabled: true } } }, 'sync');
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(11, {
      type: 'SETTINGS_CHANGED',
      settings: expect.objectContaining({ bubbleEnabled: true }),
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(22, {
      type: 'SETTINGS_CHANGED',
      settings: expect.objectContaining({ bubbleEnabled: true }),
    });
  });
});
