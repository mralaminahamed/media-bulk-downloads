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
// Tab-lifecycle + install listeners the worker registers at import time. Each is
// its own jest.fn on the shared setup mock, so grab the first (only) registration.
const onInstalled = (chrome.runtime.onInstalled.addListener as jest.Mock).mock.calls[0][0];
const onRemoved = (chrome.tabs.onRemoved.addListener as jest.Mock).mock.calls[0][0];
const onActivated = (chrome.tabs.onActivated.addListener as jest.Mock).mock.calls[0][0];
const onUpdated = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0][0];

const setSettings = (patch: Partial<SettingsData>) =>
  onChanged({ settings: { newValue: patch } }, 'sync');

describe('background DOWNLOAD_IMAGES handler', () => {
  beforeEach(() => {
    // Each download succeeds (chrome hands back a numeric downloadId). The handler
    // awaits every download before it reports the final status, so the mock must
    // invoke the callback — a bare jest.fn() would leave the response pending.
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    // Reset storage each test so a per-test reject (the port-leak case) can't bleed
    // into a sibling test's recordDownloads.
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
    setSettings({}); // reset to defaults
  });

  // The handler waits for the settings gate (resolved by setSettings above), then
  // dispatches and awaits the downloads, so assertions run after a microtask flush.
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('downloads every eligible image with a prefixed, 1-indexed name', async () => {
    const sendResponse = jest.fn();
    const images = [img({ src: 'a.jpg', type: 'jpeg' }), img({ src: 'b.png', type: 'png' })];

    onMessage({ type: 'DOWNLOAD_IMAGES', images }, {}, sendResponse);
    await flush();

    expect(chrome.downloads.download).toHaveBeenNthCalledWith(
      1,
      {
        url: 'a.jpg',
        filename: 'image_1.jpg',
        saveAs: false,
        conflictAction: 'uniquify',
      },
      expect.any(Function),
    );
    expect(chrome.downloads.download).toHaveBeenNthCalledWith(
      2,
      {
        url: 'b.png',
        filename: 'image_2.png',
        saveAs: false,
        conflictAction: 'uniquify',
      },
      expect.any(Function),
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Downloaded 2 files.' });
  });

  it('responds with an error instead of hanging when the history write rejects', async () => {
    // recordDownloads → storage.local.set rejecting (e.g. QUOTA_BYTES near the
    // ~5MB local quota) must still respond — otherwise the port stays open and the
    // popup hangs on "Sending…" forever.
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockRejectedValue(new Error('QUOTA_BYTES'));
    const sendResponse = jest.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' })] }, {}, sendResponse);
    await flush();
    await flush();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('applies the download path and prefix from settings', async () => {
    setSettings({ downloadPath: 'Pics/2026', fileNamePrefix: 'shot-' });
    const sendResponse = jest.fn();

    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' })] }, {}, sendResponse);
    await flush();

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      {
        url: 'a.jpg',
        filename: 'Pics/2026/shot-1.jpg',
        saveAs: false,
        conflictAction: 'uniquify',
      },
      expect.any(Function),
    );
  });

  it('re-filters by the current settings (min size + base64)', async () => {
    setSettings({ minimumImageSize: 50, excludeBase64Images: true });
    const sendResponse = jest.fn();
    const images = [
      img({ src: 'big.jpg', width: 200, height: 200 }),
      img({ src: 'tiny.jpg', width: 10, height: 10 }),
      img({ src: 'data', isBase64: true, width: 0, height: 0 }),
    ];

    onMessage({ type: 'DOWNLOAD_IMAGES', images }, {}, sendResponse);
    await flush();

    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'big.jpg' }),
      expect.any(Function),
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Downloaded 1 file.' });
  });

  it('reports the real outcome when some downloads fail to start', async () => {
    // Second download fails (no id + lastError); the status must reflect it,
    // not a blanket "success".
    let n = 0;
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => {
      n += 1;
      if (n === 2) {
        (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'x' };
        cb(undefined);
        (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
      } else {
        cb(1);
      }
    });
    const sendResponse = jest.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' }), img({ src: 'b.jpg' })] }, {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Downloaded 1 of 2 files — 1 failed.' });
  });

  it('reports a failure when no download starts', async () => {
    (chrome.downloads.download as jest.Mock).mockImplementation((_o, cb) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'x' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
    });
    const sendResponse = jest.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' })] }, {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: "Couldn't download 1 file." });
  });

  it('ignores unrelated messages and returns false so the port closes (no channel leak)', () => {
    const sendResponse = jest.fn();
    // A bare-string message (handled by content scripts), an unknown object type,
    // a content-script broadcast with no background handler, and null/undefined —
    // each must return `false` so Chrome tears the sendResponse channel down
    // immediately rather than leaking an open port.
    expect(onMessage('GET_IMAGES', {}, sendResponse)).toBe(false);
    expect(onMessage({ type: 'SOMETHING_ELSE' }, {}, sendResponse)).toBe(false);
    expect(onMessage({ type: 'DEEP_SCAN_PROGRESS', found: 1 }, {}, sendResponse)).toBe(false);
    expect(onMessage(null, {}, sendResponse)).toBe(false);
    expect(onMessage(undefined, {}, sendResponse)).toBe(false);
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('reports success with a "no files" message for an empty image list, without downloading', async () => {
    const sendResponse = jest.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [] }, {}, sendResponse);
    await flush();
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'No files to download.' });
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

describe('background favourite handlers', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fav = { src: 'https://c/a.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time: 1 };

  beforeEach(() => {
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ favourites: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('ADD_FAVOURITE writes the entry to storage', async () => {
    onMessage({ type: 'ADD_FAVOURITE', entry: fav }, {}, jest.fn());
    await flush();
    const written = (chrome.storage.local.set as jest.Mock).mock.calls.at(-1)![0].favourites;
    expect(written.map((x: { src: string }) => x.src)).toEqual(['https://c/a.jpg']);
  });

  it('REMOVE_FAVOURITE drops the src', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ favourites: [fav] });
    onMessage({ type: 'REMOVE_FAVOURITE', src: 'https://c/a.jpg' }, {}, jest.fn());
    await flush();
    expect((chrome.storage.local.set as jest.Mock).mock.calls.at(-1)![0].favourites).toEqual([]);
  });

  it('CLEAR_FAVOURITES empties storage', async () => {
    onMessage({ type: 'CLEAR_FAVOURITES' }, {}, jest.fn());
    await flush();
    expect((chrome.storage.local.set as jest.Mock).mock.calls.at(-1)![0].favourites).toEqual([]);
  });
});

describe('background onInstalled', () => {
  it('loads settings and (re)creates the four context menus on install', () => {
    (chrome.storage.sync.get as jest.Mock).mockClear().mockImplementation((_k, cb) => cb({}));
    (chrome.contextMenus.create as jest.Mock).mockClear();
    (chrome.contextMenus.removeAll as jest.Mock).mockImplementation((cb?: () => void) => cb?.());

    onInstalled();

    expect(chrome.storage.sync.get).toHaveBeenCalledWith(['settings'], expect.any(Function));
    const ids = (chrome.contextMenus.create as jest.Mock).mock.calls.map((c) => c[0].id);
    expect(ids).toEqual(['mbd-download-all', 'mbd-download-image', 'mbd-favourite-image', 'mbd-download-media']);
  });
});

describe('background tab lifecycle listeners', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    // applySettings (fired by setSettings) queries all tabs; a callback-form query
    // that yields no tabs keeps those side effects out of the assertions below.
    (chrome.tabs.query as jest.Mock).mockReset().mockImplementation((_q: unknown, cb?: (t: unknown[]) => void) => cb?.([]));
    (chrome.tabs.sendMessage as jest.Mock).mockReset().mockImplementation((_id: number, _m: string, cb?: (r: unknown) => void) => cb?.([]));
    (chrome.tabs.get as jest.Mock).mockReset();
    (chrome.action.setPopup as jest.Mock).mockClear();
    (chrome.action.setBadgeText as jest.Mock).mockClear();
    (chrome.action.setBadgeBackgroundColor as jest.Mock).mockClear();
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = null;
  });

  // ── onRemoved: a closed tab's sniffed-media map is dropped (no leak) ─────────
  it('drops a tab\'s sniffed media when the tab closes', async () => {
    // Seed tab 88's sniffer with a real twimg mp4 for media id 555.
    onMessage(
      { type: 'X_MEDIA_SEEN', pairs: [['555', { url: 'https://video.twimg.com/keep.mp4' }]] },
      { tab: { id: 88 } },
      jest.fn(),
    );
    const src = 'https://pbs.twimg.com/amplify_video_thumb/555/img/a.jpg';

    // Before the tab closes, RESOLVE_ORIGINALS answers from the sniffed map — no network.
    const before = jest.fn();
    onMessage({ type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] }, { tab: { id: 88 } }, before);
    await flush();
    expect(before).toHaveBeenCalledWith({ resolved: { [src]: { url: 'https://video.twimg.com/keep.mp4' } } });

    // Tab closes → its sniffed map is deleted.
    onRemoved(88);

    // Now the sniffer misses, so it falls through to the DEFAULT network dep, which
    // we stub to fail so no real request fires; the empty resolve + the fetch call
    // together prove the entry was really gone (a hit would have short-circuited).
    const fetchSpy = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const realFetch = (global as unknown as { fetch: typeof fetch }).fetch;
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;
    const after = jest.fn();
    onMessage({ type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] }, { tab: { id: 88 } }, after);
    await flush();
    expect(after).toHaveBeenCalledWith({ resolved: {} });
    expect(fetchSpy).toHaveBeenCalled();
    (global as unknown as { fetch: unknown }).fetch = realFetch;
  });

  // ── onActivated: badge refresh + action-mode sync on tab switch ──────────────
  it('refreshes the badge and the action mode when a tab is activated (count on)', () => {
    setSettings({ showImageCount: true });
    (chrome.tabs.get as jest.Mock).mockImplementation((_id: number, cb: (t: unknown) => void) => cb({ id: 3, url: 'https://example.com' }));

    onActivated({ tabId: 3 });

    // showImageCount on → the active tab's badge is recomputed (GET_IMAGES round-trip).
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, 'GET_IMAGES', expect.any(Function));
    // …and the popup/bubble action mode is synced from the fetched tab (bubble off → keep popup).
    expect(chrome.action.setPopup).toHaveBeenCalledWith({ tabId: 3, popup: 'popup.html' });
  });

  it('skips the badge (count off) and the action-mode update when tabs.get lastErrors', () => {
    setSettings({ showImageCount: false });
    (chrome.tabs.get as jest.Mock).mockImplementation((_id: number, cb: (t: unknown) => void) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'No tab with id: 99' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = null;
    });

    onActivated({ tabId: 99 });

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(99, 'GET_IMAGES', expect.any(Function));
    expect(chrome.action.setPopup).not.toHaveBeenCalled();
  });

  // ── onUpdated: action-mode + badge transitions across load states ────────────
  it('on load complete, syncs the action mode and refreshes the badge (count on)', () => {
    setSettings({ showImageCount: true });

    onUpdated(7, { status: 'complete' }, { url: 'https://example.com' });

    expect(chrome.action.setPopup).toHaveBeenCalledWith({ tabId: 7, popup: 'popup.html' });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, 'GET_IMAGES', expect.any(Function));
  });

  it('shows a placeholder badge while a tab is loading (count on)', () => {
    setSettings({ showImageCount: true });

    onUpdated(8, { status: 'loading' }, { url: 'https://example.com' });

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '...', tabId: 8 });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4F46E5', tabId: 8 });
  });

  it('syncs the action mode on a URL change but skips the badge when the count is off', () => {
    setSettings({ showImageCount: false });

    onUpdated(9, { url: 'https://example.com/next' }, { url: 'https://example.com/next' });

    expect(chrome.action.setPopup).toHaveBeenCalledWith({ tabId: 9, popup: 'popup.html' });
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('does nothing for a background-tab update that is neither complete, loading, nor a URL change (count off)', () => {
    setSettings({ showImageCount: false });

    onUpdated(10, { audible: true }, { url: 'https://example.com' });

    // No status/url change → no action-mode sync; count off → no badge either.
    expect(chrome.action.setPopup).not.toHaveBeenCalled();
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('background DOWNLOAD_BYTES handler — converted-image history', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  beforeEach(() => {
    setSettings({});
    (chrome.downloads.download as jest.Mock).mockReset().mockImplementation((_o, cb) => cb(55));
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('records the ORIGINAL src to history so a converted image gets the downloaded mark', async () => {
    onMessage({
      type: 'DOWNLOAD_BYTES', filename: 'image_1.png', b64: 'AQID', mime: 'image/png',
      source: { src: 'https://c/orig.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p' },
    }, {}, jest.fn());
    await flush();
    await flush();
    const written = (chrome.storage.local.set as jest.Mock).mock.calls.at(-1)?.[0]?.downloadHistory;
    expect(written).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: 'https://c/orig.jpg', downloadId: 55, filename: 'image_1.png' }),
    ]));
  });

  it('does not record when no source is provided (a non-media byte payload)', async () => {
    onMessage({ type: 'DOWNLOAD_BYTES', filename: 'x.png', b64: 'AQ==', mime: 'image/png' }, {}, jest.fn());
    await flush();
    await flush();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
