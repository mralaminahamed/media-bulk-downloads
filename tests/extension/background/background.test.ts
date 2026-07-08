jest.mock('@/extension/shared/storage/excluded', () => ({
  ...jest.requireActual('@/extension/shared/storage/excluded'),
  addExcluded: jest.fn().mockResolvedValue(undefined),
  removeExcluded: jest.fn().mockResolvedValue(undefined),
  clearExcluded: jest.fn().mockResolvedValue(undefined),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const excludedMod = require('@/extension/shared/storage/excluded');

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
  setupContextMenus,
  mediaFromContext,
} from '@/extension/background';
import { CaptureRunResult, ImageInfo, SettingsData } from '@/types';

// The runtime.onMessage handler is registered against the setupTests chrome
// mock at import time; capture it before any describe swaps global.chrome.
const messageHandler = (global.chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
const contextMenuHandler = (global.chrome.contextMenus.onClicked.addListener as jest.Mock).mock.calls[0][0];
const commandHandler = (global.chrome.commands.onCommand.addListener as jest.Mock).mock.calls[0][0];
// Same rationale: captures the listener that refreshes the module's live
// `excludedCache` on `chrome.storage.onChanged` (namespace 'local', EXCLUDED_KEY).
const storageChangedHandler = (global.chrome.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];

describe('Background Script', () => {
  let mockChrome: any;
  const realChrome = global.chrome;

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
        setPopup: jest.fn(),
        onClicked: { addListener: jest.fn() },
      },
      runtime: {
        lastError: null,
        onInstalled: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn() },
      },
    };
    global.chrome = mockChrome;
  });

  // This describe swaps in a bare-bones chrome mock (no `downloads`/`storage.local`)
  // for its own assertions; restore the full mock afterward so later describes in
  // this file (downloadAndRecord) see chrome.downloads and chrome.storage.local again.
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
      expect(sanitizePathSegment('.. /x')).toBe('x'); // ".. " trims to ".." then drops
      expect(sanitizePathSegment('name.')).toBe('name'); // trailing dot stripped
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
      // Wallhaven serves .jpg; the resolver reports ext:'jpg' even though the
      // canonical type is 'jpeg'. The download must keep .jpg.
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
      // extension comes from image.type, NOT the URL's extension.
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
    it('updates badge with the eligible image count', () => {
      const tabId = 1;
      const images: ImageInfo[] = [
        { src: 'a.jpg', width: 100, height: 100, alt: 'a', type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
        { src: 'b.jpg', width: 100, height: 100, alt: 'b', type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' },
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
        saveAs: false,
        notifyOnComplete: false,
        convertImagesTo: 'off',
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
        captureHlsStreams: false,
        excludeEmoji: false,
        deepScanMaxItems: 1000,
        deepScanMaxSeconds: 20,
        deepScanMaxScrolls: 40,
        deepScanClickLoadMore: false,
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
      expect(originalNameFromUrl('https://x.com/a/a%3Ab.png')).toBe('ab'); // ':' is illegal, stripped
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
    const fetchMock = jest.fn();
    const sniffed = new Map([['999', { url: 'https://video.twimg.com/orig.mp4' }]]);
    const src = 'https://pbs.twimg.com/amplify_video_thumb/999/img/x.jpg';
    const out = await resolveOriginalsBatch(
      [{ src, hint: { platform: 'twitter', id: '1' } }],
      { fetch: fetchMock as unknown as typeof fetch },
      sniffed,
    );
    expect(out).toEqual({ [src]: { url: 'https://video.twimg.com/orig.mp4' } });
    expect(fetchMock).not.toHaveBeenCalled(); // no forged request when the page already exposed it
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
});

describe('X_MEDIA_SEEN sniffer store + resolve wiring', () => {
  it('stores host-pinned sniffed mp4s per tab and resolves twitter videos from that tab without the network', async () => {
    // Sniffer feed for tab 7: a valid twimg mp4 (kept) and an off-host one (dropped by the host-pin).
    messageHandler(
      { type: 'X_MEDIA_SEEN', pairs: [['777', { url: 'https://video.twimg.com/good.mp4' }], ['888', { url: 'https://evil.com/bad.mp4' }]] },
      { tab: { id: 7 } },
      jest.fn(),
    );

    const src = 'https://pbs.twimg.com/amplify_video_thumb/777/img/a.jpg';
    const sendResponse = jest.fn();
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
      jest.fn(),
    );
    const src = 'https://pbs.twimg.com/amplify_video_thumb/654/img/a.jpg';
    const sendResponse = jest.fn();
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
    // Restore the benign default so a callback-form query left here never leaks.
    (chrome.tabs.query as jest.Mock).mockReset().mockResolvedValue([]);
  });

  it('evicts the oldest sniffed entry once the per-tab cap (800) is exceeded, and falls back to the network for it', async () => {
    const TAB = 700;
    // Fill the per-tab cap with valid twimg mp4s (media ids '1'..'800').
    const pairs = Array.from({ length: 800 }, (_, i) => [String(i + 1), { url: `https://video.twimg.com/${i + 1}.mp4` }]);
    messageHandler({ type: 'X_MEDIA_SEEN', pairs }, { tab: { id: TAB } }, jest.fn());
    // One MORE new id past the cap evicts the OLDEST ('1'); the newest ('801') stays.
    messageHandler({ type: 'X_MEDIA_SEEN', pairs: [['801', { url: 'https://video.twimg.com/801.mp4' }]] }, { tab: { id: TAB } }, jest.fn());

    // The evicted id misses the sniffer, so RESOLVE_ORIGINALS falls through to the
    // DEFAULT fetch dep (resolveOriginalsBatch's `deps` default). Stub global.fetch
    // so no real request fires and we can prove the fall-through happened.
    const fetchSpy = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const realFetch = (global as unknown as { fetch: typeof fetch }).fetch;
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    const kept = 'https://pbs.twimg.com/amplify_video_thumb/801/img/a.jpg';
    const evicted = 'https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg';
    const sendResponse = jest.fn();
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
    expect(resolved[kept]).toEqual({ url: 'https://video.twimg.com/801.mp4' }); // most-recent kept
    expect(resolved[evicted]).toBeUndefined(); // oldest evicted → not served from the sniffer
    expect(fetchSpy).toHaveBeenCalled(); // the evicted id fell through to the (default) network dep
    (global as unknown as { fetch: unknown }).fetch = realFetch;
  });

  it('resolves against the ACTIVE tab\'s sniffed media when the request carries no sender tab (popup)', async () => {
    // Seed tab 5's sniffer.
    messageHandler({ type: 'X_MEDIA_SEEN', pairs: [['321', { url: 'https://video.twimg.com/active.mp4' }]] }, { tab: { id: 5 } }, jest.fn());
    // A popup request has no sender.tab, so the handler queries the active tab.
    (chrome.tabs.query as jest.Mock).mockReset().mockImplementation((_q, cb: (t: Array<{ id: number }>) => void) => cb([{ id: 5 }]));

    const src = 'https://pbs.twimg.com/amplify_video_thumb/321/img/a.jpg';
    const sendResponse = jest.fn();
    messageHandler({ type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] }, {}, sendResponse);
    await flush();

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true }, expect.any(Function));
    expect(sendResponse).toHaveBeenCalledWith({ resolved: { [src]: { url: 'https://video.twimg.com/active.mp4' } } });
  });

  it('dedups repeated srcs in a RESOLVE_ORIGINALS batch (one resolved entry per unique src)', async () => {
    messageHandler({ type: 'X_MEDIA_SEEN', pairs: [['246', { url: 'https://video.twimg.com/dup.mp4' }]] }, { tab: { id: 61 } }, jest.fn());
    const src = 'https://pbs.twimg.com/amplify_video_thumb/246/img/a.jpg';
    const sendResponse = jest.fn();
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
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({
      downloadHistory: [
        { src: 'https://c/keep.jpg', time: 2, downloadId: 10, filename: 'k', kind: 'image', type: 'jpeg', sourcePageUrl: 'p' },
        { src: 'https://c/gone.jpg', time: 1, downloadId: 20, filename: 'g', kind: 'image', type: 'jpeg', sourcePageUrl: 'p' },
      ],
    });
    (chrome.downloads.search as jest.Mock).mockReset().mockResolvedValue([
      { id: 10, exists: true },
      { id: 20, exists: false }, // deleted/moved since download
    ]);
    const sendResponse = jest.fn();
    const async = messageHandler({ type: 'GET_DOWNLOADED_SRCS' }, {}, sendResponse);
    expect(async).toBe(true); // keeps the message channel open for the async reply
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith(['https://c/keep.jpg']);
  });

  it('responds with [] (never leaves the port open) when history/search rejects', async () => {
    (chrome.storage.local.get as jest.Mock).mockReset().mockRejectedValue(new Error('storage error'));
    const sendResponse = jest.fn();
    const async = messageHandler({ type: 'GET_DOWNLOADED_SRCS' }, {}, sendResponse);
    expect(async).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith([]);
  });
});

describe('downloadAndRecord', () => {
  beforeEach(() => {
    (chrome.downloads.download as jest.Mock).mockReset();
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
  });
  const img = (src: string) =>
    ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const });

  it('records one entry per successful download with the source page', async () => {
    (chrome.downloads.download as jest.Mock).mockImplementation((_opts, cb) => cb(42));
    await downloadAndRecord([img('https://c/a.jpg')], { url: 'https://page', title: 'T' });
    const written = (chrome.storage.local.set as jest.Mock).mock.calls[0][0].downloadHistory;
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ src: 'https://c/a.jpg', kind: 'image', sourcePageUrl: 'https://page', sourcePageTitle: 'T', downloadId: 42 });
  });

  it('passes the settings-derived filename, saveAs, and conflictAction to chrome.downloads', async () => {
    // Proves the Downloads settings actually reach the download call (default
    // settings: prefix "image_", 1-indexed, no subfolder, saveAs off).
    (chrome.downloads.download as jest.Mock).mockImplementation((_opts, cb) => cb(1));
    await downloadAndRecord([img('https://c/a.jpg')], undefined);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://c/a.jpg', filename: 'image_1.jpg', saveAs: false, conflictAction: 'uniquify' }),
      expect.any(Function),
    );
  });

  it('does not record a failed download', async () => {
    (chrome.downloads.download as jest.Mock).mockImplementation((_opts, cb) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'x' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
    });
    await downloadAndRecord([img('https://c/b.jpg')], undefined);
    expect(chrome.storage.local.set as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('runtime message router — history actions', () => {
  const dispatch = (msg: unknown) => messageHandler(msg, {}, jest.fn());

  beforeEach(() => {
    (chrome.downloads.open as jest.Mock).mockReset();
    (chrome.downloads.show as jest.Mock).mockReset();
    (chrome.tabs.create as jest.Mock).mockReset();
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
    (chrome.storage.local.set as jest.Mock).mockClear().mockResolvedValue(undefined);
    dispatch({ type: 'CLEAR_HISTORY' });
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ downloadHistory: [] });
  });

  it('removes one entry in the background on REMOVE_HISTORY_ENTRY', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({
      downloadHistory: [{ src: 'a', time: 1 }, { src: 'b', time: 2 }],
    });
    (chrome.storage.local.set as jest.Mock).mockClear().mockResolvedValue(undefined);
    dispatch({ type: 'REMOVE_HISTORY_ENTRY', src: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ downloadHistory: [{ src: 'b', time: 2 }] });
  });
});

describe('DOWNLOAD_IMAGES — settings gate (no ephemeral-worker default-settings race)', () => {
  const img = (src: string): ImageInfo =>
    ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' });

  it('waits for settings to load, then downloads into the user subfolder', async () => {
    // Load real settings (a subfolder), which resolves the settingsReady gate.
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_keys, cb) => cb({ settings: { downloadPath: 'Pics' } }));
    loadSettings();
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);

    messageHandler(
      { type: 'DOWNLOAD_IMAGES', images: [img('https://c/a.jpg')], sourcePage: undefined },
      {},
      jest.fn(),
    );
    await new Promise((r) => setTimeout(r, 0)); // flush settingsReady.then → downloadAndRecord

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Pics/image_1.jpg' }),
      expect.any(Function),
    );
  });
});

describe('DOWNLOAD_ZIP — archive bytes → data URL → chrome.downloads', () => {
  beforeEach(() => {
    // Resolve the settingsReady gate with defaults (saveAs off).
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_keys, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as jest.Mock).mockReset();
  });

  it('downloads a base64 data: URL with the given filename, saveAs, and uniquify', async () => {
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(5));
    const sendResponse = jest.fn();
    const b64 = 'UEsDBA=='; // base64 of the ZIP magic bytes 50 4b 03 04

    const handled = messageHandler(
      { type: 'DOWNLOAD_ZIP', b64, filename: 'example.com-media-2026-07-06.zip' },
      {},
      sendResponse,
    );
    expect(handled).toBe(true); // async response
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
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'boom' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
    });
    const sendResponse = jest.fn();
    messageHandler({ type: 'DOWNLOAD_ZIP', b64: 'AQ==', filename: 'x.zip' }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: "Couldn't save x.zip." });
  });
});

describe('SET_SETTINGS (serialized settings writer)', () => {
  it('deep-merges a partial bubblePosition patch, preserving the stored drag-only x/y + panelPoint', async () => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) =>
      cb({ settings: { bubblePosition: { corner: 'bottom-right', x: 99, y: 88 }, bubblePanelPoint: { x: 77, y: 66 } } }));
    let written: Record<string, unknown> | undefined;
    (chrome.storage.sync.set as jest.Mock).mockReset().mockImplementation((obj, cb) => { written = obj.settings; cb?.(); });

    messageHandler({ type: 'SET_SETTINGS', patch: { bubblePosition: { corner: 'top-left' }, bubblePanelPlacement: 'center' } }, {}, jest.fn());
    await new Promise((r) => setTimeout(r, 0));

    expect(written?.bubblePosition).toEqual({ corner: 'top-left', x: 99, y: 88 }); // x/y preserved from storage
    expect(written?.bubblePanelPoint).toEqual({ x: 77, y: 66 }); // preserved (not in the patch)
    expect(written?.bubblePanelPlacement).toBe('center'); // patch applied
  });

  it('applies a full bubblePosition patch (a bubble FAB drag) replacing x/y', async () => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) =>
      cb({ settings: { bubblePosition: { corner: 'bottom-right', x: 99, y: 88 } } }));
    let written: Record<string, unknown> | undefined;
    (chrome.storage.sync.set as jest.Mock).mockReset().mockImplementation((obj, cb) => { written = obj.settings; cb?.(); });

    messageHandler({ type: 'SET_SETTINGS', patch: { bubblePosition: { corner: 'bottom-right', x: 5, y: 6 } } }, {}, jest.fn());
    await new Promise((r) => setTimeout(r, 0));

    expect(written?.bubblePosition).toEqual({ corner: 'bottom-right', x: 5, y: 6 });
  });
});

describe('context menu', () => {
  const info = (over: Partial<chrome.contextMenus.OnClickData>): chrome.contextMenus.OnClickData =>
    ({ menuItemId: '', editable: false, pageUrl: 'https://page', ...over }) as unknown as chrome.contextMenus.OnClickData;
  const tab = (over: Partial<chrome.tabs.Tab>): chrome.tabs.Tab => (over as unknown as chrome.tabs.Tab);

  beforeEach(() => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings(); // resolve the settingsReady gate with defaults
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ downloadHistory: [], favourites: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
    (chrome.tabs.sendMessage as jest.Mock).mockReset();
  });

  it('creates the four menu items on setup', () => {
    (chrome.contextMenus.create as jest.Mock).mockClear();
    (chrome.contextMenus.removeAll as jest.Mock).mockImplementation((cb?: () => void) => cb?.());
    setupContextMenus();
    const ids = (chrome.contextMenus.create as jest.Mock).mock.calls.map((c) => c[0].id);
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
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_id, _msg, cb) =>
      cb([{ src: 'https://c/a.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' }]));
    contextMenuHandler(info({ menuItemId: 'mbd-download-all' }), tab({ id: 9, url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(9, 'GET_IMAGES', expect.any(Function));
    expect(chrome.downloads.download).toHaveBeenCalled();
  });

  it('download-all captures HLS/DASH stream items instead of downloading the manifest URL', async () => {
    // Streams only survive filterImagesBySettings when capture is enabled.
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings: { captureHlsStreams: true } }));
    loadSettings();
    await new Promise((r) => setTimeout(r, 0));
    (chrome.offscreen.hasDocument as jest.Mock).mockResolvedValue(false);
    (chrome.offscreen.createDocument as jest.Mock).mockReset().mockResolvedValue(undefined);
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 5, muxedAudio: false,
    } as CaptureRunResult);
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_id, _msg, cb) =>
      cb([
        { src: 'https://c/a.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' },
        { src: 'https://x/m.m3u8', hlsManifest: 'https://x/m.m3u8', type: 'm3u8', kind: 'video', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' },
      ]));
    contextMenuHandler(info({ menuItemId: 'mbd-download-all' }), tab({ id: 9, url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // The stream is routed through the offscreen capture engine…
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAPTURE_RUN', manifestUrl: 'https://x/m.m3u8', engine: 'hls' }),
    );
    // …and its manifest URL is NEVER handed to chrome.downloads (only the captured blob + the jpg).
    const dlUrls = (chrome.downloads.download as jest.Mock).mock.calls.map((c) => c[0].url);
    expect(dlUrls).toContain('blob:cap');
    expect(dlUrls).not.toContain('https://x/m.m3u8');
  });

  it('adds the right-clicked image to favourites', async () => {
    contextMenuHandler(info({ menuItemId: 'mbd-favourite-image', srcUrl: 'https://cdn/pic.jpg', mediaType: 'image' }), tab({ url: 'https://page', title: 'T' }));
    await new Promise((r) => setTimeout(r, 0));
    const set = (chrome.storage.local.set as jest.Mock).mock.calls.at(-1)?.[0];
    expect(set.favourites[0]).toMatchObject({ src: expect.stringContaining('pic.jpg'), kind: 'image', sourcePageUrl: 'https://page' });
  });
});

describe('DOWNLOAD_TEXT + RESTORE_DATA routers', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings(); // resolve settingsReady with defaults (saveAs off)
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb?.(1));
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ downloadHistory: [], favourites: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('DOWNLOAD_TEXT saves a base64 data URL of the text with the given filename + mime', async () => {
    messageHandler({ type: 'DOWNLOAD_TEXT', filename: 'links.txt', text: 'https://a\nhttps://b', mime: 'text/plain' }, {}, jest.fn());
    await new Promise((r) => setTimeout(r, 0));
    const arg = (chrome.downloads.download as jest.Mock).mock.calls.at(-1)[0];
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
      jest.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));
    const sets = (chrome.storage.local.set as jest.Mock).mock.calls.map((c) => c[0]);
    expect(sets.find((s) => 'favourites' in s).favourites[0].src).toBe('https://f');
    expect(sets.find((s) => 'downloadHistory' in s).downloadHistory[0].src).toBe('https://h');
  });
});

describe('keyboard commands', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb?.(1));
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
    (chrome.tabs.query as jest.Mock).mockReset();
    (chrome.tabs.sendMessage as jest.Mock).mockReset();
  });

  it('download-all-media queries the active tab and downloads its media', async () => {
    (chrome.tabs.query as jest.Mock).mockImplementation((_q, cb) => cb([{ id: 3, url: 'https://page', title: 'T' }]));
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_id, _msg, cb) =>
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
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
    (chrome.notifications.create as jest.Mock).mockReset();
  });

  it('fires a toast after a batch when notifyOnComplete is on', async () => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: true } }));
    loadSettings();
    await downloadAndRecord([img('https://c/a.jpg')], undefined);
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'basic', title: 'Media Bulk Downloads', message: 'Downloaded 1 file.' }),
      expect.any(Function),
    );
  });

  it('stays silent when notifyOnComplete is off', async () => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: false } }));
    loadSettings();
    await downloadAndRecord([img('https://c/a.jpg')], undefined);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('swallows a lastError in the notification callback (notifications permission not granted)', async () => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({ settings: { notifyOnComplete: true } }));
    loadSettings();
    // The create() callback runs with a lastError set (optional `notifications`
    // permission missing); it must read+discard it without throwing.
    (chrome.notifications.create as jest.Mock).mockImplementation((_opts, cb: () => void) => {
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
});

describe('DOWNLOAD_BYTES router', () => {
  beforeEach(() => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings();
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb?.(1));
  });

  it('saves a base64 data URL with the given mime and filename', async () => {
    messageHandler(
      { type: 'DOWNLOAD_BYTES', filename: 'cat.png', b64: 'UEsDBA==', mime: 'image/png' },
      {},
      jest.fn(),
    );
    await new Promise((r) => setTimeout(r, 0));
    const arg = (chrome.downloads.download as jest.Mock).mock.calls.at(-1)[0];
    expect(arg.filename).toBe('cat.png');
    expect(arg.url).toBe('data:image/png;base64,UEsDBA==');
    expect(arg.conflictAction).toBe('uniquify');
  });
});

describe('CAPTURE_STREAM', () => {
  const item = { src: 'https://x/m.m3u8', hlsManifest: 'https://x/m.m3u8', type: 'm3u8', kind: 'video', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' };
  const sourcePage = { url: 'https://x/watch', title: 'X' };

  beforeEach(() => {
    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings(); // resolve the settingsReady gate with defaults
    (chrome.offscreen.hasDocument as jest.Mock).mockResolvedValue(false);
    (chrome.offscreen.createDocument as jest.Mock).mockReset().mockResolvedValue(undefined);
    (chrome.downloads.download as jest.Mock).mockReset();
  });

  it('ensures the offscreen doc, downloads the returned blob, and responds with a status', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 9, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(123));
    const sendResponse = jest.fn();

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

  it('records the captured stream to history (downloaded mark + dedup, previously skipped)', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 3, muxedAudio: false,
    } as CaptureRunResult);
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(321));
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, jest.fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const written = (chrome.storage.local.set as jest.Mock).mock.calls.at(-1)?.[0]?.downloadHistory;
    expect(written).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: 'https://x/m.m3u8', downloadId: 321, kind: 'video' }),
    ]));
  });

  it('forwards CAPTURE_RUN with engine:dash for an mpd item', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 4, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(123));
    const dashItem = { ...item, type: 'mpd' };
    const sendResponse = jest.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: dashItem.hlsManifest, item: dashItem, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', engine: 'dash' }));
  });

  it('forwards CAPTURE_RUN with engine:hls for an m3u8 item', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 9, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(123));
    const sendResponse = jest.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_RUN', engine: 'hls' }));
  });

  it('tolerates the concurrent-create race: createDocument rejects but a document now exists, so capture still proceeds', async () => {
    (chrome.offscreen.hasDocument as jest.Mock).mockReset()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (chrome.offscreen.createDocument as jest.Mock).mockReset()
      .mockRejectedValue(new Error('Only a single offscreen document may be created'));
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 9, muxedAudio: true,
    } as CaptureRunResult);
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(123));
    const sendResponse = jest.fn();

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
    (chrome.offscreen.hasDocument as jest.Mock).mockReset().mockResolvedValue(false);
    (chrome.offscreen.createDocument as jest.Mock).mockReset()
      .mockRejectedValue(new Error('Only a single offscreen document may be created'));
    const sendResponse = jest.fn();

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(sendResponse).toHaveBeenCalledWith({ status: 'Couldn’t capture the stream.' });
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it('does not re-create the offscreen doc when one already exists', async () => {
    (chrome.offscreen.hasDocument as jest.Mock).mockResolvedValue(true);
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false } as CaptureRunResult);
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(1));

    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, jest.fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('responds with the mapped error and does not download when the engine fails', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ ok: false, code: 'too-large' } as CaptureRunResult);
    const sendResponse = jest.fn();
    messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: expect.stringMatching(/1 GB/) });
  });

  // The offscreen doc broadcasts CAPTURE_PROGRESS via chrome.runtime.sendMessage,
  // which never reaches content-script contexts (the on-page bubble). The
  // background relays it via chrome.tabs.sendMessage to the tab that started the
  // capture, recovered from CAPTURE_STREAM's sender.tab.id.
  describe('CAPTURE_PROGRESS relay', () => {
    beforeEach(() => {
      (chrome.tabs.sendMessage as jest.Mock).mockReset().mockResolvedValue(undefined);
    });

    it('forwards progress to the tab that started the capture', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
      } as CaptureRunResult);
      (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(1));

      messageHandler(
        { type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage },
        { tab: { id: 42 } },
        jest.fn(),
      );
      messageHandler({ type: 'CAPTURE_PROGRESS', runId: 'run-x', done: 3, total: 10 }, {}, jest.fn());

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, expect.objectContaining({ type: 'CAPTURE_PROGRESS' }));

      // Let the capture finish so its captureRunTabs entry is deleted and no
      // state leaks into other tests.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    it('routes each concurrent capture\'s progress to its own tab (no cross-talk)', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
      } as CaptureRunResult);
      (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(1));

      // Two captures in the shared offscreen doc, from different tabs.
      messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-A', manifestUrl: item.hlsManifest, item, sourcePage }, { tab: { id: 11 } }, jest.fn());
      messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-B', manifestUrl: item.hlsManifest, item, sourcePage }, { tab: { id: 22 } }, jest.fn());
      // Relay is looked up off the runId→tab map (synchronous, before the captures'
      // async completion clears their entries), so each tab gets only its own run.
      messageHandler({ type: 'CAPTURE_PROGRESS', runId: 'run-B', done: 1, total: 2 }, {}, jest.fn());
      messageHandler({ type: 'CAPTURE_PROGRESS', runId: 'run-A', done: 2, total: 2 }, {}, jest.fn());

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(22, expect.objectContaining({ runId: 'run-B' }));
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(11, expect.objectContaining({ runId: 'run-A' }));
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(11, expect.objectContaining({ runId: 'run-B' }));

      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    it('does not forward when no capture is active (popup capture, whose sender.tab is undefined)', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        ok: true, blobUrl: 'blob:cap', ext: 'mp4', mime: 'video/mp4', segmentCount: 1, muxedAudio: false,
      } as CaptureRunResult);
      (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => cb(1));

      // Popup capture: sender.tab is undefined, so no captureRunTabs entry is set.
      messageHandler({ type: 'CAPTURE_STREAM', runId: 'run-x', manifestUrl: item.hlsManifest, item, sourcePage }, {}, jest.fn());
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      messageHandler({ type: 'CAPTURE_PROGRESS', done: 1, total: 10 }, {}, jest.fn());

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });
});

describe('EXCLUDED routing', () => {
  it('ADD_EXCLUDED calls addExcluded', () => {
    messageHandler({ type: 'ADD_EXCLUDED', entry: { value: 'https://x/a.png', kind: 'url', time: 1 } }, {}, jest.fn());
    expect(excludedMod.addExcluded).toHaveBeenCalledWith({ value: 'https://x/a.png', kind: 'url', time: 1 });
  });
  it('REMOVE_EXCLUDED calls removeExcluded with kind+value', () => {
    messageHandler({ type: 'REMOVE_EXCLUDED', kind: 'host', value: 'cdn.ads.com' }, {}, jest.fn());
    expect(excludedMod.removeExcluded).toHaveBeenCalledWith('host', 'cdn.ads.com');
  });
  it('CLEAR_EXCLUDED calls clearExcluded', () => {
    messageHandler({ type: 'CLEAR_EXCLUDED' }, {}, jest.fn());
    expect(excludedMod.clearExcluded).toHaveBeenCalled();
  });
});

describe('excluded blocklist reaches the background download paths', () => {
  // This block's own stateful backing store for chrome.storage.local (mirrors
  // setupTests' mock), so seeding `excluded` here round-trips through
  // excludedMatchers() when the storage.onChanged listener reloads the cache —
  // other describes above have since overwritten the shared mock's
  // implementation with canned resolved values.
  let localStore: Record<string, unknown>;

  const adImage: ImageInfo = { src: 'https://cdn.ads.com/ad.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' };
  const goodImage: ImageInfo = { src: 'https://c/good.jpg', kind: 'image', type: 'jpeg', width: 0, height: 0, fileSize: 0, isBase64: false, alt: '' };

  beforeEach(() => {
    localStore = {};
    (chrome.storage.local.get as jest.Mock).mockReset().mockImplementation(
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
    (chrome.storage.local.set as jest.Mock).mockReset().mockImplementation((items: Record<string, unknown>) => {
      Object.assign(localStore, items);
      return Promise.resolve(undefined);
    });

    (chrome.storage.sync.get as jest.Mock).mockImplementation((_k, cb) => cb({}));
    loadSettings(); // resolve the settingsReady gate with defaults
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    (chrome.tabs.sendMessage as jest.Mock).mockReset();
  });

  afterEach(async () => {
    // Reset the module's live excludedCache back to empty so the blocklist
    // seeded here never leaks into a later test in this file.
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
    (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_id, _msg, cb) => cb([adImage, goodImage]));

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

    messageHandler({ type: 'DOWNLOAD_IMAGES', images: [adImage, goodImage], sourcePage: undefined }, {}, jest.fn());
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
