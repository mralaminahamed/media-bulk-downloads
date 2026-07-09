import type { Mock } from 'vitest';
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

const onMessage = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];
const onClicked = (chrome.action.onClicked.addListener as Mock).mock.calls[0][0];
const onChanged = (chrome.storage.onChanged.addListener as Mock).mock.calls[0][0];
// Tab-lifecycle + install listeners the worker registers at import time. Each is
// its own vi.fn on the shared setup mock, so grab the first (only) registration.
const onInstalled = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];
const onRemoved = (chrome.tabs.onRemoved.addListener as Mock).mock.calls[0][0];
const onActivated = (chrome.tabs.onActivated.addListener as Mock).mock.calls[0][0];
const onUpdated = (chrome.tabs.onUpdated.addListener as Mock).mock.calls[0][0];

const setSettings = (patch: Partial<SettingsData>) =>
  onChanged({ settings: { newValue: patch } }, 'sync');

describe('background DOWNLOAD_IMAGES handler', () => {
  beforeEach(() => {
    // Each download succeeds (chrome hands back a numeric downloadId). The queue
    // dispatcher invokes chrome.downloads.download per item — the mock must call
    // the callback so startDownload resolves.
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    // The persistent queue round-trips through storage.local, so give each test a
    // fresh, string-key-aware in-memory store (the enqueue write must be visible to
    // pump's read). A static mockResolvedValue would make pump always read empty.
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as Mock).mockReset().mockImplementation(
      async (k: string) => (typeof k === 'string' && k in local ? { [k]: local[k] } : {}),
    );
    (chrome.storage.local.set as Mock).mockReset().mockImplementation(
      async (o: Record<string, unknown>) => { Object.assign(local, o); },
    );
    setSettings({}); // reset to defaults (concurrency 5)
  });

  // The handler waits for the settings gate (resolved by setSettings above), then
  // enqueues and the dispatcher pumps downloads; a single macrotask drains the
  // whole withState microtask chain up to each download() call.
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('downloads every eligible image with a prefixed, 1-indexed name', async () => {
    const sendResponse = vi.fn();
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
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Queued 2 downloads.' });
  });

  it('responds with an error instead of hanging when the history write rejects', async () => {
    // recordDownloads → storage.local.set rejecting (e.g. QUOTA_BYTES near the
    // ~5MB local quota) must still respond — otherwise the port stays open and the
    // popup hangs on "Sending…" forever.
    (chrome.storage.local.get as Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as Mock).mockReset().mockRejectedValue(new Error('QUOTA_BYTES'));
    const sendResponse = vi.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' })] }, {}, sendResponse);
    await flush();
    await flush();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('applies the download path and prefix from settings', async () => {
    setSettings({ downloadPath: 'Pics/2026', fileNamePrefix: 'shot-' });
    const sendResponse = vi.fn();

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
    const sendResponse = vi.fn();
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
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Queued 1 download.' });
  });

  it('acknowledges the queued count even when a download fails to start (queue retries)', async () => {
    // The response now reports how many items were ENQUEUED — the queue owns the
    // per-file outcome and retries a failed start with backoff, rather than the
    // old synchronous "N failed" report.
    let n = 0;
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => {
      n += 1;
      if (n === 2) {
        (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'x' };
        cb(undefined);
        (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
      } else {
        cb(1);
      }
    });
    const sendResponse = vi.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' }), img({ src: 'b.jpg' })] }, {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Queued 2 downloads.' });
  });

  it('does not report failure on a failed start — the item is left for retry, not dropped', async () => {
    // A start that returns no id (transient error) used to be a hard failure; the
    // queue instead requeues it with a backoff (attempts incremented), so the user
    // never silently loses a file.
    (chrome.downloads.download as Mock).mockImplementation((_o, cb) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'x' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = undefined;
    });
    const sendResponse = vi.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' })] }, {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Queued 1 download.' });
  });

  it('ignores unrelated messages and returns false so the port closes (no channel leak)', () => {
    const sendResponse = vi.fn();
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
    const sendResponse = vi.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [] }, {}, sendResponse);
    await flush();
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'No files to download.' });
  });
});

describe('background toolbar click', () => {
  beforeEach(() => (chrome.tabs.sendMessage as Mock).mockClear());

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
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ favourites: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
  });

  it('ADD_FAVOURITE writes the entry to storage', async () => {
    onMessage({ type: 'ADD_FAVOURITE', entry: fav }, {}, vi.fn());
    await flush();
    const written = (chrome.storage.local.set as Mock).mock.calls.at(-1)![0].favourites;
    expect(written.map((x: { src: string }) => x.src)).toEqual(['https://c/a.jpg']);
  });

  it('REMOVE_FAVOURITE drops the src', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({ favourites: [fav] });
    onMessage({ type: 'REMOVE_FAVOURITE', src: 'https://c/a.jpg' }, {}, vi.fn());
    await flush();
    expect((chrome.storage.local.set as Mock).mock.calls.at(-1)![0].favourites).toEqual([]);
  });

  it('CLEAR_FAVOURITES empties storage', async () => {
    onMessage({ type: 'CLEAR_FAVOURITES' }, {}, vi.fn());
    await flush();
    expect((chrome.storage.local.set as Mock).mock.calls.at(-1)![0].favourites).toEqual([]);
  });
});

describe('background onInstalled', () => {
  it('loads settings and (re)creates the four context menus on install', () => {
    (chrome.storage.sync.get as Mock).mockClear().mockImplementation((_k, cb) => cb({}));
    (chrome.contextMenus.create as Mock).mockClear();
    (chrome.contextMenus.removeAll as Mock).mockImplementation((cb?: () => void) => cb?.());

    onInstalled();

    expect(chrome.storage.sync.get).toHaveBeenCalledWith(['settings'], expect.any(Function));
    const ids = (chrome.contextMenus.create as Mock).mock.calls.map((c) => c[0].id);
    expect(ids).toEqual(['mbd-download-all', 'mbd-download-image', 'mbd-favourite-image', 'mbd-download-media']);
  });
});

describe('background tab lifecycle listeners', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    // applySettings (fired by setSettings) queries all tabs; a callback-form query
    // that yields no tabs keeps those side effects out of the assertions below.
    (chrome.tabs.query as Mock).mockReset().mockImplementation((_q: unknown, cb?: (t: unknown[]) => void) => cb?.([]));
    (chrome.tabs.sendMessage as Mock).mockReset().mockImplementation((_id: number, _m: string, cb?: (r: unknown) => void) => cb?.([]));
    (chrome.tabs.get as Mock).mockReset();
    (chrome.action.setPopup as Mock).mockClear();
    (chrome.action.setBadgeText as Mock).mockClear();
    (chrome.action.setBadgeBackgroundColor as Mock).mockClear();
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = null;
  });

  // ── onRemoved: a closed tab's sniffed-media map is dropped (no leak) ─────────
  it('drops a tab\'s sniffed media when the tab closes', async () => {
    // Seed tab 88's sniffer with a real twimg mp4 for media id 555.
    onMessage(
      { type: 'X_MEDIA_SEEN', pairs: [['555', { url: 'https://video.twimg.com/keep.mp4' }]] },
      { tab: { id: 88 } },
      vi.fn(),
    );
    const src = 'https://pbs.twimg.com/amplify_video_thumb/555/img/a.jpg';

    // Before the tab closes, RESOLVE_ORIGINALS answers from the sniffed map — no network.
    const before = vi.fn();
    onMessage({ type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] }, { tab: { id: 88 } }, before);
    await flush();
    expect(before).toHaveBeenCalledWith({ resolved: { [src]: { url: 'https://video.twimg.com/keep.mp4' } } });

    // Tab closes → its sniffed map is deleted.
    onRemoved(88);

    // Now the sniffer misses, so it falls through to the DEFAULT network dep, which
    // we stub to fail so no real request fires; the empty resolve + the fetch call
    // together prove the entry was really gone (a hit would have short-circuited).
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const realFetch = (global as unknown as { fetch: typeof fetch }).fetch;
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;
    const after = vi.fn();
    onMessage({ type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] }, { tab: { id: 88 } }, after);
    await flush();
    expect(after).toHaveBeenCalledWith({ resolved: {} });
    expect(fetchSpy).toHaveBeenCalled();
    (global as unknown as { fetch: unknown }).fetch = realFetch;
  });

  // ── onActivated: badge refresh + action-mode sync on tab switch ──────────────
  it('refreshes the badge and the action mode when a tab is activated (count on)', async () => {
    setSettings({ showImageCount: true });
    (chrome.tabs.get as Mock).mockImplementation((_id: number, cb: (t: unknown) => void) => cb({ id: 3, url: 'https://example.com' }));

    onActivated({ tabId: 3 });
    // The badge refresh now awaits the settings + blocklist caches (a microtask).
    await flush();

    // showImageCount on → the active tab's badge is recomputed (GET_IMAGES round-trip).
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, 'GET_IMAGES', expect.any(Function));
    // …and the popup/bubble action mode is synced from the fetched tab (bubble off → keep popup).
    expect(chrome.action.setPopup).toHaveBeenCalledWith({ tabId: 3, popup: 'popup.html' });
  });

  it('skips the badge (count off) and the action-mode update when tabs.get lastErrors', () => {
    setSettings({ showImageCount: false });
    (chrome.tabs.get as Mock).mockImplementation((_id: number, cb: (t: unknown) => void) => {
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = { message: 'No tab with id: 99' };
      cb(undefined);
      (chrome.runtime as unknown as { lastError?: unknown }).lastError = null;
    });

    onActivated({ tabId: 99 });

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(99, 'GET_IMAGES', expect.any(Function));
    expect(chrome.action.setPopup).not.toHaveBeenCalled();
  });

  // ── onUpdated: action-mode + badge transitions across load states ────────────
  it('on load complete, syncs the action mode and refreshes the badge (count on)', async () => {
    setSettings({ showImageCount: true });

    onUpdated(7, { status: 'complete' }, { url: 'https://example.com' });
    // The badge refresh now awaits the settings + blocklist caches (a microtask).
    await flush();

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
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(55));
    (chrome.storage.local.get as Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
  });

  it('records the ORIGINAL src to history so a converted image gets the downloaded mark', async () => {
    onMessage({
      type: 'DOWNLOAD_BYTES', filename: 'image_1.png', b64: 'AQID', mime: 'image/png',
      source: { src: 'https://c/orig.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p' },
    }, {}, vi.fn());
    await flush();
    await flush();
    const written = (chrome.storage.local.set as Mock).mock.calls.at(-1)?.[0]?.downloadHistory;
    expect(written).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: 'https://c/orig.jpg', downloadId: 55, filename: 'image_1.png' }),
    ]));
  });

  it('does not record when no source is provided (a non-media byte payload)', async () => {
    onMessage({ type: 'DOWNLOAD_BYTES', filename: 'x.png', b64: 'AQ==', mime: 'image/png' }, {}, vi.fn());
    await flush();
    await flush();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
