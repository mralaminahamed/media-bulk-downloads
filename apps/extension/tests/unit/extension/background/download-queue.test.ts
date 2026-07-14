import { describe, it, expect, beforeEach, vi } from 'vitest';

const { recordDownloads } = vi.hoisted(() => ({ recordDownloads: vi.fn(async () => {}) }));
vi.mock('@mbd/storage/history', () => ({ recordDownloads }));

import {
  initQueueDispatcher, enqueueDownloads, handleDownloadChanged, getQueueSnapshot, reconcileQueue,
  cancelQueue, pollProgressForTest, __setProgressTimerForTest,
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

  it('tears down the item Referer DNR rule when reconciling a SW-dead settle (session-rule leak fix)', async () => {
    dnrRules = [{ id: 777 }]; // a Referer rewrite rule the dead SW left installed
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'r', url: 'u5', filename: 'f5', status: 'active', attempts: 0, downloadId: 500, readyAt: 0, addedAt: 0, ruleId: 777, useReferer: true },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 500, state: 'complete' }]);
    await reconcileQueue();
    await flush();
    expect((await getQueueSnapshot()).items[0].status).toBe('done');
    // The rule must be removed, not left to force Referer on that URL for the
    // rest of the browser session (the live onChanged path already does this).
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

// A sole flaky download whose backoff exceeds the fixed nudge interval used to hang
// in `queued` forever: the 2nd retry's backoff is 2000ms, the old nudge fired at
// 1100ms, found nothing ready, and nothing re-armed. pump() now arms a nudge for
// the actual readyAt after draining, so the item reaches its final attempt.
describe('retry re-pump when the backoff exceeds the fixed nudge (stuck-queue fix)', () => {
  it('re-dispatches a sole item after its 2nd-retry backoff', async () => {
    vi.useFakeTimers();
    try {
      __setProgressTimerForTest(1 as unknown as ReturnType<typeof setInterval>);
      await enqueueDownloads([{ url: 'u1', filename: 'f1' }]);
      await vi.advanceTimersByTimeAsync(0); // settle enqueue → pump → download #1
      downloadCb?.(); // attempt 1 → id 100 active
      await vi.advanceTimersByTimeAsync(0);
      expect(chrome.downloads.download).toHaveBeenCalledTimes(1);

      // Attempt 1 interrupts → retry #1 (attempts=1, backoff 1000ms).
      await handleDownloadChanged({ id: 100, state: { current: 'interrupted', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
      await vi.advanceTimersByTimeAsync(0); // let pump → armRetryNudge register the nudge timer
      await vi.advanceTimersByTimeAsync(1200); // nudge fires → attempt 2
      expect(chrome.downloads.download).toHaveBeenCalledTimes(2);
      downloadCb?.(); // attempt 2 → id 101 active
      await vi.advanceTimersByTimeAsync(0);

      // Attempt 2 interrupts → retry #2 (attempts=2, backoff 2000ms > the old 1100ms nudge).
      await handleDownloadChanged({ id: 101, state: { current: 'interrupted', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
      await vi.advanceTimersByTimeAsync(0); // register the re-armed nudge for the real readyAt
      await vi.advanceTimersByTimeAsync(2200); // the re-armed nudge fires at readyAt
      expect(chrome.downloads.download).toHaveBeenCalledTimes(3); // final attempt dispatched, not stuck

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
      downloadCb?.(); // A → id 100 active (pump then claims B)
      await vi.advanceTimersByTimeAsync(0);
      downloadCb?.(); // B → id 101 active
      await vi.advanceTimersByTimeAsync(0);
      expect(chrome.downloads.download).toHaveBeenCalledTimes(2); // both slots busy

      // B interrupts → retry #1 (readyAt ≈ +1000). A is still downloading and never
      // completes in this test. The retry must fire on its own backoff into the free
      // slot, NOT block until A finishes.
      await handleDownloadChanged({ id: 101, state: { current: 'interrupted', previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
      await vi.advanceTimersByTimeAsync(0); // register the nudge
      await vi.advanceTimersByTimeAsync(1200); // its backoff elapses
      expect(chrome.downloads.download).toHaveBeenCalledTimes(3); // B re-dispatched while A is still active
      expect(chrome.downloads.download).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'uB' }), expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cancelling an item tears down its in-flight download + DNR rule (leak fix)', () => {
  it('aborts the chrome transfer and removes the Referer rule when an active item is cancelled', async () => {
    dnrRules = [{ id: 555 }]; // a Referer-rewrite rule installed for this download
    await saveQueue({ paused: false, items: [
      { id: 'x', url: 'u', filename: 'f', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 42, ruleId: 555, useReferer: true },
    ] });

    await cancelQueue('x');

    // The file must not keep downloading, and the session rule must not leak: once
    // the item is gone, handleDownloadChanged can no longer match it to tear it down.
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
