import { describe, it, expect, beforeEach, vi } from 'vitest';

const { recordDownloads } = vi.hoisted(() => ({ recordDownloads: vi.fn(async () => {}) }));
vi.mock('@mbd/storage/history', () => ({ recordDownloads }));

import {
  initQueueDispatcher, enqueueDownloads, handleDownloadChanged, getQueueSnapshot, reconcileQueue,
  pollProgressForTest, __setProgressTimerForTest,
} from '@/extension/background/download/download-queue';
import { QUEUE_KEY, saveQueue, loadQueue } from '@mbd/storage/download-queue';

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
  // pump() now starts a real setInterval progress poll once an item goes active;
  // seed a truthy sentinel so ensureProgressPoll() sees a timer "already running"
  // and never schedules a real one, keeping this suite free of leaked timers.
  // (clearInterval on a bogus handle is a safe no-op if pollProgress ever self-stops.)
  __setProgressTimerForTest(1 as unknown as ReturnType<typeof setInterval>);
});

// A macrotask runs only after the entire microtask queue drains, so one tick
// settles the whole withState promise chain up to the next download() suspension.
const flush = async () => { await new Promise((r) => setTimeout(r, 0)); };

describe('queue dispatcher', () => {
  it('pumps up to the concurrency cap', async () => {
    await enqueueDownloads([
      { url: 'u1', filename: 'f1' }, { url: 'u2', filename: 'f2' }, { url: 'u3', filename: 'f3' },
    ]);
    await flush();
    if (downloadCb) downloadCb(); // resolve first download → id 100
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
    if (downloadCb) downloadCb(); // first → id 100
    await flush();
    await handleDownloadChanged({
      id: 100, state: { current: 'complete', previous: 'in_progress' },
    } as chrome.downloads.DownloadDelta);
    await flush();
    const snap = await getQueueSnapshot();
    expect(snap.items.find((i) => i.url === 'u1')!.status).toBe('done');
    expect(recordDownloads).toHaveBeenCalledOnce();
    expect(chrome.downloads.download).toHaveBeenCalledTimes(3); // third dispatched after slot freed
  });

  it('retries on interrupted (attempts increments, item leaves active)', async () => {
    await enqueueDownloads([{ url: 'u1', filename: 'f1' }]);
    await flush();
    if (downloadCb) downloadCb(); // id 100
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
    if (downloadCb) downloadCb(); // id 100 active
    await flush();

    await handleDownloadChanged(forbidden(100));
    await flush();
    let snap = await getQueueSnapshot();
    expect(snap.items[0].useReferer).toBe(true);
    expect(dnrRules.length).toBe(1); // rule installed for the retry dispatch
    expect(chrome.downloads.download).toHaveBeenCalledTimes(2); // original + referer retry

    if (downloadCb) downloadCb(); // retry id 101 active
    await flush();
    await handleDownloadChanged({ id: 101, state: { current: 'complete', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
    await flush();
    snap = await getQueueSnapshot();
    expect(snap.items[0].status).toBe('done');
    expect(dnrRules.length).toBe(0); // rule torn down after the attempt settled
    expect(recordDownloads).toHaveBeenCalledOnce();
  });

  it('403 + permission requeue clears stale bytesReceived/totalBytes (bug: stale progress bytes)', async () => {
    permGranted = true;
    await enqueueDownloads([withPage('https://cdn/x2.jpg', 'https://gallery/album2')]);
    await flush();
    if (downloadCb) downloadCb(); // id 100 active
    await flush();

    // Simulate byte progress having been polled in before the 403 interrupt arrives.
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
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1); // no retry
  });

  it('a Referer retry that still 403s fails as hotlink (no infinite loop)', async () => {
    permGranted = true;
    await enqueueDownloads([withPage('https://cdn/z.jpg', 'https://p')]);
    await flush();
    if (downloadCb) downloadCb(); // id 100
    await flush();
    await handleDownloadChanged(forbidden(100)); // → useReferer requeue
    await flush();
    if (downloadCb) downloadCb(); // referer retry id 101 active
    await flush();
    await handleDownloadChanged(forbidden(101)); // useReferer already set → give up
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
    // No error field → isForbidden falls to search() which returns [] → not forbidden.
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
    expect(s.items[0].status).toBe('queued'); // scheduled retry
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
    // Reports NOT complete (interrupted), so the item is requeued rather than marked done.
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 300, state: 'interrupted' }]);
    await reconcileQueue();
    const snap = await getQueueSnapshot();
    expect(['queued', 'active']).toContain(snap.items[0].status);
    expect(snap.items[0].bytesReceived).toBeUndefined();
    expect(snap.items[0].totalBytes).toBeUndefined();
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

  // Backstop for the stuck-slot bug: if the download's `complete` onChanged fired
  // in the window before markActive persisted the item's downloadId (tiny/cached/
  // data: downloads settle almost instantly), or the SW was briefly asleep when it
  // fired, the item stays `active` forever holding a concurrency slot — UI shows
  // 100% but it never finishes and starves the rest of the queue. The poll must
  // detect chrome's terminal state and settle the item through the same path.
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
    // Freed slot → the queued item is dispatched.
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
