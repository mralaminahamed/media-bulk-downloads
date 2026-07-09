import {
  loadQueue, saveQueue, enqueue, claimNext, markActive, markDone,
  scheduleRetry, cancel, retryFailed, type EnqueueEntry, type QueueState,
} from '@/extension/shared/storage/download-queue';
import { recordDownloads } from '@/extension/shared/storage/history';

interface Deps {
  getConcurrency: () => number;
  getSaveAs: () => boolean;
}

let deps: Deps = { getConcurrency: () => 5, getSaveAs: () => false };

// Serialize all queue mutations through one promise chain so a concurrent
// onChanged handler and pump() can't clobber each other's last-write-wins save.
let chain: Promise<unknown> = Promise.resolve();
function withState<T>(fn: (s: QueueState) => Promise<{ state: QueueState; value: T }>): Promise<T> {
  const run = chain.then(async () => {
    const s = await loadQueue();
    const { state, value } = await fn(s);
    await saveQueue(state);
    return value;
  });
  // Keep the chain alive regardless of individual outcomes.
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function startDownload(url: string, filename: string): Promise<number | undefined> {
  return new Promise((resolve) =>
    chrome.downloads.download(
      { url, filename, saveAs: deps.getSaveAs(), conflictAction: 'uniquify' },
      (id) => resolve(chrome.runtime.lastError ? undefined : id),
    ),
  );
}

export function initQueueDispatcher(d: Deps): void {
  deps = d;
  chrome.downloads.onChanged.addListener((delta) => {
    void handleDownloadChanged(delta);
  });
}

export async function enqueueDownloads(entries: EnqueueEntry[]): Promise<number> {
  const added = await withState(async (s) => {
    const next = enqueue(s, entries, Date.now());
    return { state: next, value: next.items.length - s.items.length };
  });
  void pump();
  return added;
}

export async function pump(): Promise<void> {
  const max = deps.getConcurrency();
  // Claim one item per turn (persisting its 'active' mark) then start it, so a
  // freed slot refills on the next iteration.
  for (;;) {
    const claimed = await withState(async (s) => {
      const c = claimNext(s, max, Date.now());
      return c ? { state: c.state, value: c.item } : { state: s, value: null };
    });
    if (!claimed) break;
    const downloadId = await startDownload(claimed.url, claimed.filename);
    if (downloadId === undefined) {
      await withState(async (s) => ({ state: scheduleRetry(s, claimed.id, Date.now()), value: null }));
      scheduleNudge();
    } else {
      await withState(async (s) => ({ state: markActive(s, claimed.id, downloadId), value: null }));
    }
  }
}

export async function handleDownloadChanged(delta: chrome.downloads.DownloadDelta): Promise<void> {
  const current = delta.state?.current;
  if (current !== 'complete' && current !== 'interrupted') return;
  const done = await withState(async (s) => {
    const item = s.items.find((i) => i.downloadId === delta.id && i.status === 'active');
    if (!item) return { state: s, value: null };
    if (current === 'complete') return { state: markDone(s, item.id), value: item };
    return { state: scheduleRetry(s, item.id, Date.now()), value: null };
  });
  if (done?.history) {
    void recordDownloads([{ ...done.history, time: Date.now(), downloadId: delta.id }]);
  }
  scheduleNudge();
  void pump();
}

// A retried item becomes claimable only once its backoff `readyAt` passes; this
// timer re-pumps then. If the SW is terminated first, startup reconcile re-pumps
// (the readyAt has already elapsed by then), so no alarm permission is needed.
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNudge(): void {
  if (nudgeTimer) return;
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    void pump();
  }, 1100);
}

export async function pauseQueue(): Promise<void> {
  await withState(async (s) => ({ state: { ...s, paused: true }, value: null }));
}

export async function resumeQueue(): Promise<void> {
  await withState(async (s) => ({ state: { ...s, paused: false }, value: null }));
  void pump();
}

export async function cancelQueue(target: string): Promise<void> {
  await withState(async (s) => ({ state: cancel(s, target), value: null }));
}

export async function retryQueueItem(id: string): Promise<void> {
  await withState(async (s) => ({ state: retryFailed(s, id, Date.now()), value: null }));
  void pump();
}

export async function getQueueSnapshot(): Promise<QueueState> {
  return loadQueue();
}

// On service-worker startup, reconcile any items left 'active' when the worker
// died: if Chrome finished the download meanwhile, mark it done; otherwise put it
// back in the queue so pump() re-dispatches it. Then drain whatever is claimable.
export async function reconcileQueue(): Promise<void> {
  const snapshot = await loadQueue();
  const actives = snapshot.items.filter((i) => i.status === 'active' && i.downloadId !== undefined);
  for (const item of actives) {
    let completed = false;
    try {
      const [hit] = await chrome.downloads.search({ id: item.downloadId });
      completed = hit?.state === 'complete';
    } catch {
      // search unavailable → treat as needing a requeue rather than losing the item.
    }
    await withState(async (s) => {
      const cur = s.items.find((i) => i.id === item.id);
      if (!cur || cur.status !== 'active') return { state: s, value: null };
      if (completed) return { state: markDone(s, item.id), value: null };
      const items = s.items.map((i) =>
        i.id === item.id ? { ...i, status: 'queued' as const, downloadId: undefined, readyAt: Date.now() } : i,
      );
      return { state: { ...s, items }, value: null };
    });
  }
  void pump();
}
