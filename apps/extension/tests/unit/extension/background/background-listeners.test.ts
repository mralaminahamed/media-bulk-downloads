import type { Mock } from 'vitest';
/**
 * Exercises background listeners registered at import time (download handler,
 * toolbar click, settings changes). These use the shared setup mock rather than
 * a per-test replacement so the captured listeners see the same chrome object.
 */
import '@/extension/background';
import { ImageInfo, SettingsData } from '@mbd/core/types';
import * as dlKeys from '@/extension/background/download/downloaded-keys';
import { SrcKeySet } from '@mbd/core/collection/canonical';

const img = (over: Partial<ImageInfo>): ImageInfo => ({
  src: 'x.jpg', alt: '', width: 100, height: 100, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image', ...over,
});

const onMessage = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];
const onClicked = (chrome.action.onClicked.addListener as Mock).mock.calls[0][0];
const onChanged = (chrome.storage.onChanged.addListener as Mock).mock.calls[0][0];
const onInstalled = (chrome.runtime.onInstalled.addListener as Mock).mock.calls[0][0];
const onRemoved = (chrome.tabs.onRemoved.addListener as Mock).mock.calls[0][0];
const onActivated = (chrome.tabs.onActivated.addListener as Mock).mock.calls[0][0];
const onUpdated = (chrome.tabs.onUpdated.addListener as Mock).mock.calls[0][0];
const onDownloadChanged = (chrome.downloads.onChanged.addListener as Mock).mock.calls[0][0];

const setSettings = (patch: Partial<SettingsData>) =>
  onChanged({ settings: { newValue: patch } }, 'sync');

describe('background DOWNLOAD_IMAGES handler', () => {
  beforeEach(() => {
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(1));
    const local: Record<string, unknown> = {};
    (chrome.storage.local.get as Mock).mockReset().mockImplementation(
      async (k: string) => (typeof k === 'string' && k in local ? { [k]: local[k] } : {}),
    );
    (chrome.storage.local.set as Mock).mockReset().mockImplementation(
      async (o: Record<string, unknown>) => { Object.assign(local, o); },
    );
    setSettings({});
  });

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

  it('still responds (never hangs) when a storage write rejects', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({ downloadHistory: [] });
    (chrome.storage.local.set as Mock).mockReset().mockRejectedValue(new Error('QUOTA_BYTES'));
    const sendResponse = vi.fn();
    onMessage({ type: 'DOWNLOAD_IMAGES', images: [img({ src: 'a.jpg' })] }, {}, sendResponse);
    await flush();
    await flush();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: expect.any(String) }));
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

  it('de-collides distinct images that derive the same original-mode filename, and records the de-collided name to history', async () => {
    setSettings({ namingMode: 'original', skipDuplicateDownloads: false });

    let nextId = 501;
    (chrome.downloads.download as Mock).mockReset().mockImplementation((_o, cb) => cb(nextId++));

    const sendResponse = vi.fn();
    const images = [
      img({ src: 'https://a.example/x/photo.png', type: 'png' }),
      img({ src: 'https://b.example/y/photo.png', type: 'png' }),
    ];

    onMessage({ type: 'DOWNLOAD_IMAGES', images }, {}, sendResponse);
    await flush();

    expect(chrome.downloads.download).toHaveBeenCalledTimes(2);
    const filename1 = (chrome.downloads.download as Mock).mock.calls[0][0].filename as string;
    const filename2 = (chrome.downloads.download as Mock).mock.calls[1][0].filename as string;
    expect(filename1).toMatch(/(^|\/)photo\.png$/);
    expect(filename2).toMatch(/(^|\/)photo-2\.png$/);
    expect(filename1).not.toBe(filename2);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Queued 2 downloads.' });

    onDownloadChanged({ id: 501, state: { current: 'complete', previous: 'in_progress' } });
    await flush();
    await flush();
    onDownloadChanged({ id: 502, state: { current: 'complete', previous: 'in_progress' } });
    await flush();
    await flush();

    const written = (chrome.storage.local.set as Mock).mock.calls
      .map((c) => c[0]?.downloadHistory)
      .filter(Array.isArray)
      .flat();
    expect(written).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: 'https://a.example/x/photo.png', filename: 'photo.png' }),
      expect.objectContaining({ src: 'https://b.example/y/photo.png', filename: 'photo-2.png' }),
    ]));
  });

  describe('skipDuplicateDownloads (on-disk dedupe)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('skips an already-downloaded src and reports the skipped count', async () => {
      vi.spyOn(dlKeys, 'downloadedOnDiskKeys').mockResolvedValue(SrcKeySet.from(['https://x/a.png']));
      const sendResponse = vi.fn();
      const images = [img({ src: 'https://x/a.png', type: 'png' }), img({ src: 'https://x/b.png', type: 'png' })];

      onMessage({ type: 'DOWNLOAD_IMAGES', images }, {}, sendResponse);
      await flush();

      expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://x/b.png' }),
        expect.any(Function),
      );
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        message: expect.stringContaining('1 skipped'),
      }));
    });

    it('does not skip when the message is explicit', async () => {
      vi.spyOn(dlKeys, 'downloadedOnDiskKeys').mockResolvedValue(SrcKeySet.from(['https://x/a.png']));
      const sendResponse = vi.fn();

      onMessage(
        { type: 'DOWNLOAD_IMAGES', explicit: true, images: [img({ src: 'https://x/a.png', type: 'png' })] },
        {},
        sendResponse,
      );
      await flush();

      expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://x/a.png' }),
        expect.any(Function),
      );
    });

    it('does not skip when skipDuplicateDownloads is off, and the message shape is unchanged', async () => {
      setSettings({ skipDuplicateDownloads: false });
      vi.spyOn(dlKeys, 'downloadedOnDiskKeys').mockResolvedValue(SrcKeySet.from(['https://x/a.png']));
      const sendResponse = vi.fn();

      onMessage(
        { type: 'DOWNLOAD_IMAGES', images: [img({ src: 'https://x/a.png', type: 'png' })] },
        {},
        sendResponse,
      );
      await flush();

      expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://x/a.png' }),
        expect.any(Function),
      );
      expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Queued 1 download.' });
    });
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
    (chrome.tabs.query as Mock).mockReset().mockImplementation((_q: unknown, cb?: (t: unknown[]) => void) => cb?.([]));
    (chrome.tabs.sendMessage as Mock).mockReset().mockImplementation((_id: number, _m: string, cb?: (r: unknown) => void) => cb?.([]));
    (chrome.tabs.get as Mock).mockReset();
    (chrome.action.setPopup as Mock).mockClear();
    (chrome.action.setBadgeText as Mock).mockClear();
    (chrome.action.setBadgeBackgroundColor as Mock).mockClear();
    (chrome.runtime as unknown as { lastError?: unknown }).lastError = null;
  });

  it('drops a tab\'s sniffed media when the tab closes', async () => {
    onMessage(
      { type: 'X_MEDIA_SEEN', pairs: [['555', { url: 'https://video.twimg.com/keep.mp4' }]] },
      { tab: { id: 88 } },
      vi.fn(),
    );
    const src = 'https://pbs.twimg.com/amplify_video_thumb/555/img/a.jpg';

    const before = vi.fn();
    onMessage({ type: 'RESOLVE_ORIGINALS', hints: [{ src, hint: { platform: 'twitter', id: '1' } }] }, { tab: { id: 88 } }, before);
    await flush();
    expect(before).toHaveBeenCalledWith({ resolved: { [src]: { url: 'https://video.twimg.com/keep.mp4' } } });

    onRemoved(88);

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

  it('refreshes the badge and the action mode when a tab is activated (count on)', async () => {
    setSettings({ showImageCount: true });
    (chrome.tabs.get as Mock).mockImplementation((_id: number, cb: (t: unknown) => void) => cb({ id: 3, url: 'https://example.com' }));

    onActivated({ tabId: 3 });
    await flush();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, 'GET_IMAGES', expect.any(Function));
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

  it('on load complete, syncs the action mode and refreshes the badge (count on)', async () => {
    setSettings({ showImageCount: true });

    onUpdated(7, { status: 'complete' }, { url: 'https://example.com' });
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
    const written = (chrome.storage.local.set as Mock).mock.calls
      .map((c) => c[0]?.downloadHistory)
      .filter(Array.isArray)
      .flat();
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
