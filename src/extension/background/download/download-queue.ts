import {
  loadQueue, saveQueue, enqueue, claimNext, markActive, markDone, markFailed,
  scheduleRetry, cancel, retryFailed, setProgress, clearFinished, retryAllFailed, type EnqueueEntry, type QueueState,
} from '@/extension/shared/storage/download-queue';
import { recordDownloads } from '@/extension/shared/storage/history';
import { applyRefererRule, removeRefererRule, hasDnrPermission } from './hotlink-rewrite';

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
    if (state !== s) await saveQueue(state);
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
    // Hotlink 403 retry (#197): install a scoped Referer-rewrite DNR rule before
    // this dispatch and remember its id so the download's onChanged can tear it
    // down. Best-effort — a rule failure just proceeds without the rewrite.
    let ruleId: number | undefined;
    if (claimed.useReferer) {
      try {
        ruleId = await applyRefererRule(claimed.url, claimed.history?.sourcePageUrl);
        const rid = ruleId;
        await withState(async (s) => ({
          state: { ...s, items: s.items.map((i) => (i.id === claimed.id ? { ...i, ruleId: rid } : i)) },
          value: null,
        }));
      } catch {
        ruleId = undefined;
      }
    }
    const downloadId = await startDownload(claimed.url, claimed.filename);
    if (downloadId === undefined) {
      if (ruleId != null) await removeRefererRule(ruleId);
      await withState(async (s) => ({
        state: scheduleRetry({ ...s, items: s.items.map((i) => (i.id === claimed.id ? { ...i, ruleId: undefined } : i)) }, claimed.id, Date.now()),
        value: null,
      }));
      scheduleNudge();
    } else {
      await withState(async (s) => ({ state: markActive(s, claimed.id, downloadId), value: null }));
      ensureProgressPoll();
    }
  }
}

// The interrupt reason: it may ride on the onChanged delta itself; if not, ask
// chrome.downloads for the record. Undefined when unavailable.
async function interruptError(delta: chrome.downloads.DownloadDelta): Promise<string | undefined> {
  if (delta.error?.current) return delta.error.current;
  try {
    const [dl] = await chrome.downloads.search({ id: delta.id });
    return dl?.error;
  } catch {
    return undefined;
  }
}

export async function handleDownloadChanged(delta: chrome.downloads.DownloadDelta): Promise<void> {
  const current = delta.state?.current;
  if (current !== 'complete' && current !== 'interrupted') return;

  // Snapshot the matching item first: we need its flags (useReferer / ruleId)
  // before mutating, and the 403 + permission checks are async.
  const snapshot = await loadQueue();
  const item = snapshot.items.find((i) => i.downloadId === delta.id && i.status === 'active');
  if (!item) return;

  const errCode = current === 'interrupted' ? await interruptError(delta) : undefined;
  const forbidden = errCode === 'SERVER_FORBIDDEN';
  const cancelled = errCode === 'USER_CANCELED';
  // A 403 is worth a Referer-rewrite retry only once, and only if the user has
  // granted the optional declarativeNetRequestWithHostAccess permission. Otherwise it fails with
  // the hotlink flag so the popup can offer an explicit opt-in.
  const rewrite = forbidden && !item.useReferer && (await hasDnrPermission());

  const done = await withState(async (s) => {
    const cur = s.items.find((i) => i.id === item.id && i.status === 'active');
    if (!cur) return { state: s, value: null };
    if (current === 'complete') return { state: markDone(s, cur.id), value: cur };
    if (forbidden) {
      if (rewrite) {
        // Arm the rewrite and requeue immediately — not counted toward the normal
        // backoff attempt cap (a bare 403 retry never changes; the referer does).
        const items = s.items.map((i) =>
          i.id === cur.id
            ? {
                ...i, status: 'queued' as const, readyAt: Date.now(), downloadId: undefined, ruleId: undefined, useReferer: true,
                bytesReceived: undefined, totalBytes: undefined,
              }
            : i,
        );
        return { state: { ...s, items }, value: null };
      }
      return { state: markFailed(s, cur.id, 'SERVER_FORBIDDEN', true), value: null };
    }
    if (cancelled) return { state: markFailed(s, cur.id, 'Cancelled'), value: null };
    return { state: scheduleRetry(s, cur.id, Date.now()), value: null };
  });

  // The attempt has settled — tear down any Referer rule that was active for it.
  if (item.ruleId != null) await removeRefererRule(item.ruleId);
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

const PROGRESS_POLL_MS = 600;
let progressTimer: ReturnType<typeof setInterval> | null = null;

function stopProgressPoll(): void {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}
function ensureProgressPoll(): void {
  if (!progressTimer) progressTimer = setInterval(() => { void pollProgress(); }, PROGRESS_POLL_MS);
}

// Poll chrome.downloads for each active item's byte progress and persist it via
// the shared mutex. Self-stops when nothing is active. Exported (test-only names)
// so the poll can be driven deterministically without a real timer.
async function pollProgress(): Promise<void> {
  await withState(async (s) => {
    const actives = s.items.filter((i) => i.status === 'active' && i.downloadId !== undefined);
    if (actives.length === 0) { stopProgressPoll(); return { state: s, value: null }; }
    let next = s;
    for (const it of actives) {
      let dl: chrome.downloads.DownloadItem | undefined;
      try { [dl] = await chrome.downloads.search({ id: it.downloadId }); } catch { dl = undefined; }
      if (!dl) continue;
      const total = typeof dl.totalBytes === 'number' && dl.totalBytes > 0 ? dl.totalBytes : undefined;
      next = setProgress(next, it.downloadId as number, dl.bytesReceived ?? 0, total);
    }
    return { state: next, value: null }; // withState skips the write when next === s
  });
}

/** @internal test seam */
export const pollProgressForTest = (): Promise<void> => pollProgress();
/** @internal test seam */
export const __setProgressTimerForTest = (v: ReturnType<typeof setInterval> | null): void => { progressTimer = v; };

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

export async function retryQueueItem(id: string, referer = false): Promise<void> {
  await withState(async (s) => ({ state: retryFailed(s, id, Date.now(), referer), value: null }));
  void pump();
}

export async function getQueueSnapshot(): Promise<QueueState> {
  return loadQueue();
}

export async function clearFinishedQueue(): Promise<void> {
  await withState(async (s) => ({ state: clearFinished(s), value: null }));
}

export async function retryAllFailedQueue(): Promise<void> {
  await withState(async (s) => ({ state: retryAllFailed(s, Date.now()), value: null }));
  void pump();
}

export async function openQueueItem(id: string): Promise<void> {
  const s = await loadQueue();
  const it = s.items.find((i) => i.id === id);
  if (it && it.status === 'done' && it.downloadId !== undefined) chrome.downloads.open(it.downloadId);
}

// On service-worker startup, reconcile any items left 'active' when the worker
// died: if Chrome finished the download meanwhile, mark it done; otherwise put it
// back in the queue so pump() re-dispatches it. Then drain whatever is claimable.
export async function reconcileQueue(): Promise<void> {
  let snapshot: QueueState;
  try {
    snapshot = await loadQueue();
  } catch {
    // Storage unavailable (e.g. a worker torn down mid-read) → nothing to
    // reconcile now; the next startup retries. Never reject (callers `void` us).
    return;
  }
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
        i.id === item.id
          ? { ...i, status: 'queued' as const, downloadId: undefined, readyAt: Date.now(), bytesReceived: undefined, totalBytes: undefined }
          : i,
      );
      return { state: { ...s, items }, value: null };
    });
  }
  void pump();
}
