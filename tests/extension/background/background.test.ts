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
import { ImageInfo, SettingsData } from '@/types';

// The runtime.onMessage handler is registered against the setupTests chrome
// mock at import time; capture it before any describe swaps global.chrome.
const messageHandler = (global.chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
const contextMenuHandler = (global.chrome.contextMenus.onClicked.addListener as jest.Mock).mock.calls[0][0];

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
      expect(extensionForType('jpeg')).toBe('jpeg');
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
    it('maps jpeg type to a .jpeg extension', () => {
      expect(extensionForType('jpeg')).toBe('jpeg');
    });

    it('names a jpeg image file with .jpeg', () => {
      const img = { src: 'https://pbs.twimg.com/media/ABC?format=jpg&name=orig', alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' as const };
      const name = buildDownloadFilename(img, 0, { ...DEFAULT_SETTINGS, namingMode: 'original', downloadPath: '' });
      expect(name).toMatch(/\.jpeg$/);
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
      expect(buildDownloadFilename(img({ type: 'jpeg' }), 0, settings)).toBe('image_1.jpeg');
      expect(buildDownloadFilename(img({ type: 'png' }), 4, settings)).toBe('image_5.png');
    });

    it('prefers the resolver-supplied ext over the type-derived extension', () => {
      // Wallhaven serves .jpg; the resolver reports ext:'jpg' even though the
      // canonical type is 'jpeg'. The download must keep .jpg.
      expect(buildDownloadFilename(img({ type: 'jpeg', ext: 'jpg' }), 0, settings)).toBe('image_1.jpg');
      expect(buildDownloadFilename(img({ type: 'jpeg', ext: 'png' }), 0, settings)).toBe('image_1.png');
    });

    it('falls back to the type-derived extension when the resolver gave no ext', () => {
      expect(buildDownloadFilename(img({ type: 'jpeg' }), 0, settings)).toBe('image_1.jpeg');
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
      expect(buildDownloadFilename(img({ src: 'https://x.com/a/cat.png', type: 'jpeg' }), 0, s)).toBe('cat.jpeg');
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
      ).toBe('image/cdn.example.org/image_1.jpeg');
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
    expect(out).toEqual({ 'poster.jpg': 'https://video.twimg.com/hi.mp4' });
  });

  it('prefers a sniffed mp4 over the network for a twitter video poster', async () => {
    const fetchMock = jest.fn();
    const sniffed = new Map([['999', 'https://video.twimg.com/orig.mp4']]);
    const src = 'https://pbs.twimg.com/amplify_video_thumb/999/img/x.jpg';
    const out = await resolveOriginalsBatch(
      [{ src, hint: { platform: 'twitter', id: '1' } }],
      { fetch: fetchMock as unknown as typeof fetch },
      sniffed,
    );
    expect(out).toEqual({ [src]: 'https://video.twimg.com/orig.mp4' });
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
    expect(out).toEqual({ [src]: 'https://video.twimg.com/net.mp4' });
  });
});

describe('X_MEDIA_SEEN sniffer store + resolve wiring', () => {
  it('stores host-pinned sniffed mp4s per tab and resolves twitter videos from that tab without the network', async () => {
    // Sniffer feed for tab 7: a valid twimg mp4 (kept) and an off-host one (dropped by the host-pin).
    messageHandler(
      { type: 'X_MEDIA_SEEN', pairs: [['777', 'https://video.twimg.com/good.mp4'], ['888', 'https://evil.com/bad.mp4']] },
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
    expect(sendResponse).toHaveBeenCalledWith({ resolved: { [src]: 'https://video.twimg.com/good.mp4' } });
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
      expect.objectContaining({ url: 'https://c/a.jpg', filename: 'image_1.jpeg', saveAs: false, conflictAction: 'uniquify' }),
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
      expect.objectContaining({ filename: 'Pics/image_1.jpeg' }),
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
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP magic

    const handled = messageHandler(
      { type: 'DOWNLOAD_ZIP', bytes, filename: 'example.com-media-2026-07-06.zip' },
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
    messageHandler({ type: 'DOWNLOAD_ZIP', bytes: new Uint8Array([1]), filename: 'x.zip' }, {}, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: "Couldn't save x.zip." });
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
