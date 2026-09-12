import {
  loadQueue, saveQueue, enqueue, claimNext, markActive, markDone, markFailed,
  scheduleRetry, cancel, retryFailed, setProgress, clearDone, retryAllFailed,
  recoverStuckActive, RECOVER_GRACE_MS,
  type EnqueueEntry, type QueueState, type QueueItem,
} from '@mbd/storage/download-queue';
import { recordDownloads } from '@mbd/storage/history';
import { isLeaseExpired } from '@mbd/core/net/url-lease';
import { notifyBatchDone } from '@/extension/background/download/downloads';
import { applyRefererRule, removeRefererRule, hasDnrPermission } from '@/extension/background/download/hotlink-rewrite';
import { scheduleSidecar } from '@/extension/background/download/sidecar-writer';
import { platform } from '@/extension/platform';
import type { DownloadRecord } from '@mbd/platform';

/** The subset of a download state-change the queue reacts to (the platform
 *  Downloader's onChanged payload). */
type DownloadChange = { id: number; state?: DownloadRecord['state']; error?: string };

interface Deps {
  getConcurrency: () => number;
  getSaveAs: () => boolean;
}

let deps: Deps = { getConcurrency: () => 5, getSaveAs: () => false };

let chain: Promise<unknown> = Promise.resolve();
function withState<T>(fn: (s: QueueState) => Promise<{ state: QueueState; value: T }>): Promise<T> {
  const run = chain.then(async () => {
    const s = await loadQueue();
    const { state, value } = await fn(s);
    if (state !== s) {
      const persisted = await saveQueue(state);
      if (!persisted) {
        console.warn('[mbd] download queue exceeded the storage quota; pending items may not survive a service-worker restart.');
      }
    }
    return value;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function startDownload(url: string, filename: string): Promise<number | undefined> {
  return platform.downloader.download({ url, filename, saveAs: deps.getSaveAs(), conflictAction: 'uniquify' });
}

export function initQueueDispatcher(d: Deps): void {
  deps = d;
  if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; nudgeReadyAt = Infinity; }
  platform.downloader.onChanged((change) => {
    void handleDownloadChanged(change);
  });
}

/** Batch outcome accumulated across the whole queue drain, so the completion
 *  toast reports what actually happened rather than what was dispatched. The
 *  keyboard/context-menu surface used to notify off the dispatch count. */
let batch = { done: 0, failed: 0, skipped: 0 };

async function notifyIfDrained(): Promise<void> {
  if (batch.done === 0 && batch.failed === 0 && batch.skipped === 0) return;
  let s: QueueState;
  try { s = await loadQueue(); } catch { return; }
  if (s.items.some((i) => i.status === 'queued' || i.status === 'active')) return;
  const { done, failed, skipped } = batch;
  batch = { done: 0, failed: 0, skipped: 0 };
  notifyBatchDone({ total: done + failed, succeeded: done, failed, skipped });
}

export async function enqueueDownloads(entries: EnqueueEntry[], skipped = 0): Promise<number> {
  batch.skipped += skipped;
  const added = await withState(async (s) => {
    const next = enqueue(s, entries, Date.now());
    return { state: next, value: next.items.length - s.items.length };
  });
  void pump();
  if (added === 0) void notifyIfDrained();
  return added;
}

export async function pump(): Promise<void> {
  const max = deps.getConcurrency();
  for (;;) {
    const claimed = await withState(async (s) => {
      const c = claimNext(s, max, Date.now());
      return c ? { state: c.state, value: c.item } : { state: s, value: null };
    });
    if (!claimed) break;
    // A lapsed signed URL is a guaranteed 403 — fail it here rather than
    // spending a request and MAX_ATTEMPTS of backoff on it.
    if (isLeaseExpired(claimed.expiresAt, Date.now())) {
      await withState(async (s) => ({
        state: markFailed(s, claimed.id, 'Link expired', { expired: true }),
        value: null,
      }));
      batch.failed++;
      continue;
    }
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
        if (ruleId != null) await removeRefererRule(ruleId).catch(() => {});
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
    } else {
      if (claimed.sidecar) scheduleSidecar(downloadId, claimed.filename, claimed.sidecar);
      await withState(async (s) => ({ state: markActive(s, claimed.id, downloadId), value: null }));
      ensureProgressPoll();
    }
  }
  await armRetryNudge();
}

async function interruptError(change: DownloadChange): Promise<string | undefined> {
  if (change.error) return change.error;
  try {
    const [dl] = await platform.downloader.search({ id: change.id });
    return dl?.error;
  } catch {
    return undefined;
  }
}

export async function handleDownloadChanged(change: DownloadChange): Promise<void> {
  const current = change.state;
  if (current !== 'complete' && current !== 'interrupted') return;

  const snapshot = await loadQueue();
  const item = snapshot.items.find((i) => i.downloadId === change.id && i.status === 'active');
  if (!item) return;

  const errCode = current === 'interrupted' ? await interruptError(change) : undefined;
  const forbidden = errCode === 'SERVER_FORBIDDEN';
  const cancelled = errCode === 'USER_CANCELED';
  // A 403 on a lapsed lease is expiry, not hotlink protection — a Referer
  // rewrite cannot help, so never arm one and never offer the retry.
  const expired = forbidden && isLeaseExpired(item.expiresAt, Date.now());
  const rewrite = forbidden && !expired && !item.useReferer && (await hasDnrPermission());

  // Completion is observed by BOTH the downloader.onChanged listener and the
  // progress poller's terminal loop; both call this handler. Only the call that
  // actually finds the item still `active` transitions it — so counters and the
  // recorded status must come from THIS transition (`value`), never from a
  // post-hoc loadQueue() re-read (which the second, no-op call would also read as
  // done/failed and double-count).
  const outcome = await withState(async (s) => {
    const cur = s.items.find((i) => i.id === item.id && i.status === 'active');
    if (!cur) return { state: s, value: null };
    let next: QueueState;
    if (current === 'complete') next = markDone(s, cur.id);
    else if (forbidden && expired) next = markFailed(s, cur.id, 'Link expired', { expired: true });
    else if (forbidden && rewrite) {
      next = {
        ...s,
        items: s.items.map((i) =>
          i.id === cur.id
            ? {
                ...i, status: 'queued' as const, readyAt: Date.now(), downloadId: undefined, ruleId: undefined, useReferer: true,
                bytesReceived: undefined, totalBytes: undefined,
              }
            : i,
        ),
      };
    } else if (forbidden) next = markFailed(s, cur.id, 'SERVER_FORBIDDEN', { hotlink: true });
    else if (cancelled) next = markFailed(s, cur.id, 'Cancelled');
    else next = scheduleRetry(s, cur.id, Date.now());
    const status = next.items.find((i) => i.id === cur.id)?.status;
    return { state: next, value: { status, history: current === 'complete' ? cur.history : undefined } };
  });

  if (item.ruleId != null) await removeRefererRule(item.ruleId);
  if (outcome?.history) {
    void recordDownloads([{ ...outcome.history, time: Date.now(), downloadId: change.id }]);
  }
  if (outcome?.status === 'done') batch.done++;
  else if (outcome?.status === 'failed') batch.failed++;
  // Never await pump() here: it resolves only once the backend's download
  // callback fires, which for a caller awaiting this handler is a deadlock.
  void pump();
  void notifyIfDrained();
}

let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
let nudgeReadyAt = Infinity;

function scheduleNudgeAt(readyAt: number, delayMs: number): void {
  if (nudgeTimer && nudgeReadyAt <= readyAt) return;
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeReadyAt = readyAt;
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    nudgeReadyAt = Infinity;
    void pump();
  }, Math.max(0, delayMs));
}

async function armRetryNudge(): Promise<void> {
  let s: QueueState;
  try { s = await loadQueue(); } catch { return; }
  if (s.paused) return;
  const raw = deps.getConcurrency();
  const cap = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  const active = s.items.filter((i) => i.status === 'active').length;
  if (active >= cap) return;
  const readyAts = s.items.filter((i) => i.status === 'queued').map((i) => i.readyAt);
  if (readyAts.length === 0) return;
  const soonest = Math.min(...readyAts);
  scheduleNudgeAt(soonest, soonest - Date.now());
}

const PROGRESS_POLL_MS = 600;
let progressTimer: ReturnType<typeof setInterval> | null = null;

function stopProgressPoll(): void {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}
function ensureProgressPoll(): void {
  if (!progressTimer) progressTimer = setInterval(() => { void pollProgress(); }, PROGRESS_POLL_MS);
}

async function pollProgress(): Promise<void> {
  const snapshot = await loadQueue();
  const actives = snapshot.items.filter((i) => i.status === 'active' && i.downloadId !== undefined);
  if (actives.length === 0) { stopProgressPoll(); return; }

  const progress: { downloadId: number; bytesReceived: number; totalBytes?: number }[] = [];
  const terminal: { id: number; state: 'complete' | 'interrupted' }[] = [];
  for (const it of actives) {
    let dl: DownloadRecord | undefined;
    try { [dl] = await platform.downloader.search({ id: it.downloadId }); } catch { dl = undefined; }
    if (!dl) continue;
    if (dl.state === 'complete' || dl.state === 'interrupted') {
      terminal.push({ id: it.downloadId as number, state: dl.state });
      continue;
    }
    const total = typeof dl.totalBytes === 'number' && dl.totalBytes > 0 ? dl.totalBytes : undefined;
    progress.push({ downloadId: it.downloadId as number, bytesReceived: dl.bytesReceived ?? 0, totalBytes: total });
  }

  if (progress.length) {
    await withState(async (s) => {
      let next = s;
      for (const p of progress) next = setProgress(next, p.downloadId, p.bytesReceived, p.totalBytes);
      return { state: next, value: null };
    });
  }

  for (const t of terminal) {
    await handleDownloadChanged({ id: t.id, state: t.state });
  }
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
  const isLive = (i: QueueItem): boolean => i.status === 'queued' || i.status === 'active';
  const removed = await withState(async (s) => {
    const toRemove = s.items.filter((i) => (target === 'all' ? isLive(i) : i.id === target));
    return { state: cancel(s, target), value: toRemove };
  });
  for (const it of removed) {
    // Never let a cancel failure abort the loop — the referer-rule teardown below
    // must still run for this and every remaining item.
    if (it.downloadId != null) {
      try { platform.downloader.cancel(it.downloadId); } catch { /* already gone */ }
    }
    if (it.ruleId != null) await removeRefererRule(it.ruleId);
  }
}

export async function retryQueueItem(id: string, referer = false): Promise<void> {
  await withState(async (s) => ({ state: retryFailed(s, id, Date.now(), referer), value: null }));
  void pump();
}

export async function getQueueSnapshot(): Promise<QueueState> {
  return loadQueue();
}

export async function clearDoneQueue(): Promise<void> {
  await withState(async (s) => ({ state: clearDone(s), value: null }));
}

export async function retryAllFailedQueue(): Promise<void> {
  await withState(async (s) => ({ state: retryAllFailed(s, Date.now()), value: null }));
  void pump();
}

export async function openQueueItem(id: string): Promise<void> {
  const s = await loadQueue();
  const it = s.items.find((i) => i.id === id);
  if (it && it.status === 'done' && it.downloadId !== undefined) platform.downloader.open(it.downloadId);
}

export async function reconcileQueue(): Promise<void> {
  let snapshot: QueueState;
  try {
    snapshot = await loadQueue();
  } catch {
    return;
  }
  const now = Date.now();

  const stuckNoId = snapshot.items.filter(
    (i) => i.status === 'active' && i.downloadId === undefined && now - (i.claimedAt ?? 0) > RECOVER_GRACE_MS,
  );
  if (stuckNoId.length) {
    // The SW died in the window between claimNext() persisting `active` and
    // markActive() persisting the id chrome returned — but chrome.downloads may
    // have ALREADY started (or finished) that download. Re-issuing it blindly
    // duplicates the file, so first try to ADOPT a recent download whose url
    // matches the item; only genuinely-orphaned items (nothing started) re-queue.
    let recent: DownloadRecord[];
    try { recent = await platform.downloader.search({ limit: 100 }); } catch { recent = []; }
    for (const it of stuckNoId) {
      const hit = recent.find((d) => d.url === it.url && (d.state === 'complete' || d.state === 'in_progress'));
      if (!hit) continue;
      if (hit.state === 'complete') {
        const done = await withState(async (s) => {
          const cur = s.items.find((i) => i.id === it.id && i.status === 'active');
          return cur ? { state: markDone(s, it.id), value: cur } : { state: s, value: null };
        });
        if (done?.history) void recordDownloads([{ ...done.history, time: now, downloadId: hit.id }]);
      } else {
        await withState(async (s) => ({ state: markActive(s, it.id, hit.id), value: null }));
        ensureProgressPoll();
      }
    }
    // recoverStuckActive only re-queues items STILL active-with-no-id — the ones
    // adopted above are now done/active-with-id, so it skips them.
    await withState(async (s) => ({ state: recoverStuckActive(s, now), value: null }));
    for (const it of stuckNoId) {
      if (it.ruleId != null) await removeRefererRule(it.ruleId);
    }
  }

  const actives = snapshot.items.filter((i) => i.status === 'active' && i.downloadId !== undefined);
  for (const item of actives) {
    let hit: DownloadRecord | undefined;
    try {
      [hit] = await platform.downloader.search({ id: item.downloadId });
    } catch {
      hit = undefined;
    }

    if (hit?.state === 'in_progress') continue;

    const completed = hit?.state === 'complete';
    const doneItem = await withState(async (s) => {
      const cur = s.items.find((i) => i.id === item.id);
      if (!cur || cur.status !== 'active') return { state: s, value: null };
      if (completed) return { state: markDone(s, item.id), value: cur };
      const cleared = { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, ruleId: undefined } : i)) };
      return { state: scheduleRetry(cleared, item.id, now), value: cur };
    });
    if (item.ruleId != null) await removeRefererRule(item.ruleId);
    if (doneItem?.history) {
      void recordDownloads([{ ...doneItem.history, time: now, downloadId: item.downloadId }]);
    }
  }
  void pump();
}
