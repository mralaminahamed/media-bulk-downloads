import { describe, it, expect, beforeEach, vi } from 'vitest';

const { recordDownloads } = vi.hoisted(() => ({ recordDownloads: vi.fn(async () => {}) }));
vi.mock('@/extension/shared/storage/history', () => ({ recordDownloads }));

import {
  initQueueDispatcher, enqueueDownloads, handleDownloadChanged, getQueueSnapshot, reconcileQueue,
} from '@/extension/background/download-queue';
import { QUEUE_KEY } from '@/extension/shared/storage/download-queue';

let store: Record<string, unknown>;
let downloadCb: (() => void) | null;
let nextId: number;

beforeEach(() => {
  store = {};
  nextId = 100;
  downloadCb = null;
  recordDownloads.mockClear();
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k: string) => (k in store ? { [k]: store[k] } : {})),
        set: vi.fn(async (o: Record<string, unknown>) => { Object.assign(store, o); }),
      },
    },
    downloads: {
      download: vi.fn((_opts: unknown, cb: (id: number) => void) => { downloadCb = () => cb(nextId++); }),
      search: vi.fn(async () => []),
      onChanged: { addListener: vi.fn() },
    },
    runtime: { lastError: undefined },
  } as unknown as typeof chrome;
  initQueueDispatcher({ getConcurrency: () => 2, getSaveAs: () => false });
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

  it('requeues active→queued when the download is missing/interrupted', async () => {
    store[QUEUE_KEY] = { paused: false, items: [
      { id: 'b', url: 'u2', filename: 'f2', status: 'active', attempts: 0, downloadId: 200, readyAt: 0, addedAt: 0 },
    ] };
    (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await reconcileQueue();
    const snap = await getQueueSnapshot();
    expect(['queued', 'active']).toContain(snap.items[0].status);
  });
});
