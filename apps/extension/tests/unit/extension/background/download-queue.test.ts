import { describe, it, expect, beforeEach, vi } from 'vitest';

const { recordDownloads } = vi.hoisted(() => ({ recordDownloads: vi.fn(async () => {}) }));
vi.mock('@mbd/storage/history', () => ({ recordDownloads }));

import {
  initQueueDispatcher, enqueueDownloads, handleDownloadChanged, getQueueSnapshot, reconcileQueue,
  cancelQueue, pollProgressForTest, __setProgressTimerForTest,
} from '@/extension/background/download/download-queue';
import { QUEUE_KEY, saveQueue, loadQueue, MAX_ATTEMPTS } from '@mbd/storage/download-queue';

let store: Record<string, unknown>;
let downloadCb: (() => void) | null;
let nextId: number;
let permGranted: boolean;
let dnrRules: { id: number }[];
let downloadOpts: { url: string }[];

beforeEach(() => {
  store = {};
  nextId = 100;
  downloadCb = null;
  permGranted = false;
  dnrRules = [];
  downloadOpts = [];
  recordDownloads.mockClear();
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k: string) => (k in store ? { [k]: store[k] } : {})),
        set: vi.fn(async (o: Record<string, unknown>) => { Object.assign(store, o); }),
      },
    },
    downloads: {
      download: vi.fn((opts: { url: string }, cb: (id: number) => void) => {
        downloadOpts.push(opts);
        downloadCb = () => cb(nextId++);
      }),
      search: vi.fn(async () => []),
      cancel: vi.fn((_id: number, cb?: () => void) => cb?.()),
      onChanged: { addListener: vi.fn() },
    },
    permissions: { contains: vi.fn(async () => permGranted), request: vi.fn(async () => true) },
    declarativeNetRequest: {
      getSessionRules: vi.fn(async () => dnrRules),
      updateSessionRules: vi.fn(async (o: { addRules?: { id: number }[]; removeRuleIds?: number[] }) => {
        if (o.removeRuleIds) dnrRules = dnrRules.filter((r) => !o.removeRuleIds!.includes(r.id));
        if (o.addRules) dnrRules.push(...o.addRules);
      }),
    },
    runtime: { lastError: undefined },
  } as unknown as typeof chrome;
  initQueueDispatcher({ getConcurrency: () => 2, getSaveAs: () => false });
  __setProgressTimerForTest(1 as unknown as ReturnType<typeof setInterval>);
});

const flush = async () => { await new Promise((r) => setTimeout(r, 0)); };

describe('queue dispatcher', () => {
  it('pumps up to the concurrency cap', async () => {
    await enqueueDownloads([
      { url: 'u1', filename: 'f1' }, { url: 'u2', filename: 'f2' }, { url: 'u3', filename: 'f3' },
    ]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items.filter((i) => i.status === 'active').length).toBeLessThanOrEqual(2);
    expect(chrome.downloads.download).toHaveBeenCalledTimes(2);
  });

  it('marks done + records history on state=complete, then pumps the next', async () => {
    await enqueueDownloads([
      { url: 'u1', filename: 'f1', history: {
        src: 'u1', filename: 'f1', kind: 'image', type: 'image/jpeg', thumbnailSrc: 'u1', sourcePageUrl: '',
      } },
      { url: 'u2', filename: 'f2' }, { url: 'u3', filename: 'f3' },
    ]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();
    await handleDownloadChanged({
      id: 100, state: { current: 'complete', previous: 'in_progress' },
    } as chrome.downloads.DownloadDelta);
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items.find((i) => i.url === 'u1')!.status).toBe('done');
    expect(recordDownloads).toHaveBeenCalledOnce();
    expect(chrome.downloads.download).toHaveBeenCalledTimes(3);
  });

  it('retries on interrupted (attempts increments, item leaves active)', async () => {
    await enqueueDownloads([{ url: 'u1', filename: 'f1' }]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();
    await handleDownloadChanged({
      id: 100, state: { current: 'interrupted', previous: 'in_progress' },
    } as chrome.downloads.DownloadDelta);
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0].attempts).toBe(1);
    expect(snap.items[0].status).toBe('queued');
    expect(snap.items[0].downloadId).toBeUndefined();
  });
});

describe('hotlink 403 handling', () => {
  const withPage = (url: string, sourcePageUrl: string) => ({
    url, filename: url.split('/').pop()!, history: {
      src: url, filename: url.split('/').pop()!, kind: 'image' as const, type: 'image/jpeg', thumbnailSrc: '', sourcePageUrl,
    },
  });
  const forbidden = (id: number) => ({
    id, state: { current: 'interrupted', previous: 'in_progress' }, error: { previous: null, current: 'SERVER_FORBIDDEN' },
  } as unknown as chrome.downloads.DownloadDelta);

  it('403 + permission → arms Referer rewrite, retries with a DNR rule, then completes and tears it down', async () => {
    permGranted = true;
    await enqueueDownloads([withPage('https://cdn/x.jpg', 'https://gallery/album')]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();

    await handleDownloadChanged(forbidden(100));
    await flush();
    let snap = await getQueueSnapshot();
    expect(snap.items[0].useReferer).toBe(true);
    expect(dnrRules.length).toBe(1);
    expect(chrome.downloads.download).toHaveBeenCalledTimes(2);

    if (downloadCb) downloadCb();
    await flush();
    await handleDownloadChanged({ id: 101, state: { current: 'complete', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
    await flush();
    snap = await getQueueSnapshot();
    expect(snap.items[0].status).toBe('done');
    expect(dnrRules.length).toBe(0);
    expect(recordDownloads).toHaveBeenCalledOnce();
  });

  it('403 + permission requeue clears stale bytesReceived/totalBytes (bug: stale progress bytes)', async () => {
    permGranted = true;
    await enqueueDownloads([withPage('https://cdn/x2.jpg', 'https://gallery/album2')]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();

    const cur = store[QUEUE_KEY] as { items: Array<Record<string, unknown>> };
    cur.items[0] = { ...cur.items[0], bytesReceived: 500, totalBytes: 1000 };

    await handleDownloadChanged(forbidden(100));
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0].useReferer).toBe(true);
    expect(snap.items[0].bytesReceived).toBeUndefined();
    expect(snap.items[0].totalBytes).toBeUndefined();
  });

  it('403 without permission → fails with the hotlink flag and installs no rule', async () => {
    permGranted = false;
    await enqueueDownloads([{ url: 'https://cdn/y.jpg', filename: 'y.jpg' }]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();
    await handleDownloadChanged(forbidden(100));
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0]).toMatchObject({ status: 'failed', hotlink: true });
    expect(dnrRules.length).toBe(0);
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
  });

  it('a Referer retry that still 403s fails as hotlink (no infinite loop)', async () => {
    permGranted = true;
    await enqueueDownloads([withPage('https://cdn/z.jpg', 'https://p')]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();
    await handleDownloadChanged(forbidden(100));
    await flush();
    if (downloadCb) downloadCb();
    await flush();
    await handleDownloadChanged(forbidden(101));
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0]).toMatchObject({ status: 'failed', hotlink: true });
    expect(dnrRules.length).toBe(0);
  });

  it('non-403 interrupt still uses ordinary backoff (unchanged)', async () => {
    permGranted = true;
    await enqueueDownloads([{ url: 'https://cdn/w.jpg', filename: 'w.jpg' }]);
    await flush();
    if (downloadCb) downloadCb();
    await flush();
    await handleDownloadChanged({ id: 100, state: { current: 'interrupted', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0].status).toBe('queued');
    expect(snap.items[0].attempts).toBe(1);
    expect(snap.items[0].hotlink).toBeUndefined();
    expect(dnrRules.length).toBe(0);
  });
});

describe('user-cancelled download (Save-As dialog dismissed)', () => {
  it('marks the item failed with no retry on USER_CANCELED', async () => {
    await saveQueue({ paused: false, items: [
      { id: 'a', url: 'u', filename: 'a.jpg', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 5 },
    ] });
    await handleDownloadChanged({ id: 5, state: { current: 'interrupted', previous: 'in_progress' }, error: { current: 'USER_CANCELED' } } as unknown as chrome.downloads.DownloadDelta);
    const s = await loadQueue();
    expect(s.items[0].status).toBe('failed');
    expect(s.items[0].error).toBe('Cancelled');
  });

  it('still schedules a retry for an ordinary (non-cancel, non-403) interrupt', async () => {
    await saveQueue({ paused: false, items: [
      { id: 'b', url: 'u', filename: 'b.jpg', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 6 },
    ] });
    await handleDownloadChanged({ id: 6, state: { current: 'interrupted', previous: 'in_progress' }, error: { current: 'NETWORK_FAILED' } } as unknown as chrome.downloads.DownloadDelta);
    const s = await loadQueue();
    expect(s.items[0].status).toBe('queued');
    expect(s.items[0].attempts).toBe(1);
  });
});

describe('reconcile on restart', () => {
  it('marks active→done when the download completed while the SW was dead', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'a', url: 'u1', filename: 'f1', status: 'active', attempts: 0, downloadId: 100, readyAt: 0, addedAt: 0 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 100, state: 'complete' }]);
    await reconcileQueue();
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0].status).toBe('done');
  });

  it('records history when the SW-dead completion is reconciled (else the file is missing from History + on-disk dedupe)', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      {
        id: 'd', url: 'u4', filename: 'f4', status: 'active', attempts: 0, downloadId: 400, readyAt: 0, addedAt: 0,
        history: { src: 'u4', filename: 'f4', kind: 'image', type: 'image/jpeg', thumbnailSrc: 'u4', sourcePageUrl: '' },
      },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 400, state: 'complete' }]);
    await reconcileQueue();
    await flush();
    expect((await getQueueSnapshot()).items[0].status).toBe('done');
    expect(recordDownloads).toHaveBeenCalledOnce();
    expect(recordDownloads).toHaveBeenCalledWith([expect.objectContaining({ src: 'u4', downloadId: 400 })]);
  });

  it('tears down the item Referer DNR rule when reconciling a SW-dead settle (session-rule leak fix)', async () => {
    dnrRules = [{ id: 777 }];
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'r', url: 'u5', filename: 'f5', status: 'active', attempts: 0, downloadId: 500, readyAt: 0, addedAt: 0, ruleId: 777, useReferer: true },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 500, state: 'complete' }]);
    await reconcileQueue();
    await flush();
    expect((await getQueueSnapshot()).items[0].status).toBe('done');
    expect(dnrRules.find((r) => r.id === 777)).toBeUndefined();
  });

  it('requeues active→queued when the download is missing/interrupted', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'b', url: 'u2', filename: 'f2', status: 'active', attempts: 0, downloadId: 200, readyAt: 0, addedAt: 0 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await reconcileQueue();
    const snap = await getQueueSnapshot();
    expect(['queued', 'active']).toContain(snap.items[0].status);
  });

  it('clears stale bytesReceived/totalBytes on the active→queued requeue (bug: stale progress bytes)', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      {
        id: 'c', url: 'u3', filename: 'f3', status: 'active', attempts: 0, downloadId: 300, readyAt: 0, addedAt: 0,
        bytesReceived: 4096, totalBytes: 8192,
      },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 300, state: 'interrupted' }]);
    await reconcileQueue();
    const snap = await getQueueSnapshot();
    expect(['queued', 'active']).toContain(snap.items[0].status);
    expect(snap.items[0].bytesReceived).toBeUndefined();
    expect(snap.items[0].totalBytes).toBeUndefined();
  });

  it('leaves an in_progress download alone on reconcile (no duplicate dispatch)', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'f', url: 'u7', filename: 'f7', status: 'active', attempts: 0, downloadId: 700, readyAt: 0, addedAt: 0 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 700, state: 'in_progress' }]);
    await reconcileQueue();
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0]).toMatchObject({ status: 'active', downloadId: 700 });
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it('recovers a stuck-active item that never got a downloadId before the SW died', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'e', url: 'u6', filename: 'f6', status: 'active', attempts: 0, readyAt: 0, addedAt: 0 },
    ] };
    await reconcileQueue();
    await flush();
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'u6' }), expect.any(Function),
    );
  });

  it('routes an interrupted item on reconcile through scheduleRetry (attempts increments)', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'g', url: 'u8', filename: 'f8', status: 'active', attempts: 0, downloadId: 800, readyAt: 0, addedAt: 0 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 800, state: 'interrupted' }]);
    await reconcileQueue();
    const snap = await getQueueSnapshot();
    expect(snap.items[0].status).toBe('queued');
    expect(snap.items[0].attempts).toBe(1);
  });

  it('caps interrupted retries at MAX_ATTEMPTS across SW restarts → failed, not an infinite retry', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      {
        id: 'h', url: 'u9', filename: 'f9', status: 'active', attempts: MAX_ATTEMPTS - 1,
        downloadId: 900, readyAt: 0, addedAt: 0,
      },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 900, state: 'interrupted' }]);
    await reconcileQueue();
    const snap = await getQueueSnapshot();
    expect(snap.items[0].status).toBe('failed');
    expect(snap.items[0].attempts).toBe(MAX_ATTEMPTS);
  });
});

describe('progress poll', () => {
  it('writes live bytes for an active item from chrome.downloads.search', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'a', url: 'u', filename: 'a', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 7 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 7, bytesReceived: 400, totalBytes: 800 }]);
    await pollProgressForTest();
    const snap = await getQueueSnapshot();
    expect(snap.items[0]).toMatchObject({ bytesReceived: 400, totalBytes: 800 });
  });

  it('does not write when nothing changed (no-op skip)', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      {
        id: 'a', url: 'u', filename: 'a', status: 'active', attempts: 0, readyAt: 0, addedAt: 0,
        downloadId: 7, bytesReceived: 400, totalBytes: 800,
      },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 7, bytesReceived: 400, totalBytes: 800 }]);
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockClear();
    await pollProgressForTest();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('settles a completed download whose onChanged was missed, then pumps the next (race backstop)', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      {
        id: 'a', url: 'u1', filename: 'f1', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 7,
        history: { src: 'u1', filename: 'f1', kind: 'image', type: 'image/jpeg', thumbnailSrc: 'u1', sourcePageUrl: '' },
      },
      { id: 'b', url: 'u2', filename: 'f2', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 7, state: 'complete', bytesReceived: 800, totalBytes: 800 }]);
    await pollProgressForTest();
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items.find((i) => i.id === 'a')!.status).toBe('done');
    expect(recordDownloads).toHaveBeenCalledOnce();
    expect(chrome.downloads.download).toHaveBeenCalledWith(expect.objectContaining({ url: 'u2' }), expect.any(Function));
  });

  it('settles an interrupted download whose onChanged was missed → schedules a retry (backstop)', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'a', url: 'u', filename: 'f', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 9 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 9, state: 'interrupted', error: 'NETWORK_FAILED' }]);
    await pollProgressForTest();
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items[0].status).toBe('queued');
    expect(snap.items[0].attempts).toBe(1);
    expect(snap.items[0].downloadId).toBeUndefined();
  });
});

describe('retry re-pump when the backoff exceeds the fixed nudge (stuck-queue fix)', () => {
  it('re-dispatches a sole item after its 2nd-retry backoff', async () => {
    vi.useFakeTimers();
    try {
      __setProgressTimerForTest(1 as unknown as ReturnType<typeof setInterval>);
      await enqueueDownloads([{ url: 'u1', filename: 'f1' }]);
      await vi.advanceTimersByTimeAsync(0);
      downloadCb?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(chrome.downloads.download).toHaveBeenCalledTimes(1);

      await handleDownloadChanged({ id: 100, state: { current: 'interrupted', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1200);
      expect(chrome.downloads.download).toHaveBeenCalledTimes(2);
      downloadCb?.();
      await vi.advanceTimersByTimeAsync(0);

      await handleDownloadChanged({ id: 101, state: { current: 'interrupted', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2200);
      expect(chrome.downloads.download).toHaveBeenCalledTimes(3);

      const snap = await getQueueSnapshot();
      expect(snap.items[0].status).toBe('active');
      expect(snap.items[0].attempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-dispatches a retry into a FREE slot without waiting for an unrelated active download (concurrency>1)', async () => {
    initQueueDispatcher({ getConcurrency: () => 2, getSaveAs: () => false });
    vi.useFakeTimers();
    try {
      __setProgressTimerForTest(1 as unknown as ReturnType<typeof setInterval>);
      await enqueueDownloads([{ url: 'uA', filename: 'fA' }, { url: 'uB', filename: 'fB' }]);
      await vi.advanceTimersByTimeAsync(0);
      downloadCb?.();
      await vi.advanceTimersByTimeAsync(0);
      downloadCb?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(chrome.downloads.download).toHaveBeenCalledTimes(2);

      await handleDownloadChanged({ id: 101, state: { current: 'interrupted', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1200);
      expect(chrome.downloads.download).toHaveBeenCalledTimes(3);
      expect(chrome.downloads.download).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'uB' }), expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cancelling an item tears down its in-flight download + DNR rule (leak fix)', () => {
  it('aborts the chrome transfer and removes the Referer rule when an active item is cancelled', async () => {
    dnrRules = [{ id: 555 }];
    await saveQueue({ paused: false, items: [
      { id: 'x', url: 'u', filename: 'f', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 42, ruleId: 555, useReferer: true },
    ] });

    await cancelQueue('x');

    expect(chrome.downloads.cancel).toHaveBeenCalledWith(42, expect.any(Function));
    expect(dnrRules.find((r) => r.id === 555)).toBeUndefined();
    expect((await getQueueSnapshot()).items).toHaveLength(0);
  });

  it('cancel "all" aborts every active transfer (queued items need no cancel)', async () => {
    await saveQueue({ paused: false, items: [
      { id: 'a', url: 'u1', filename: 'f1', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 10 },
      { id: 'b', url: 'u2', filename: 'f2', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
    ] });
    (chrome.downloads.cancel as ReturnType<typeof vi.fn>).mockClear();

    await cancelQueue('all');

    expect(chrome.downloads.cancel).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.cancel).toHaveBeenCalledWith(10, expect.any(Function));
    expect((await getQueueSnapshot()).items).toHaveLength(0);
  });

  it('does not call chrome.downloads.cancel for a not-yet-started (queued) item', async () => {
    await saveQueue({ paused: false, items: [
      { id: 'q', url: 'u', filename: 'f', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
    ] });
    (chrome.downloads.cancel as ReturnType<typeof vi.fn>).mockClear();

    await cancelQueue('q');

    expect(chrome.downloads.cancel).not.toHaveBeenCalled();
    expect((await getQueueSnapshot()).items).toHaveLength(0);
  });
});
