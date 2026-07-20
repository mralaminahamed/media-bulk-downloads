import {
  loadQueue, saveQueue, enqueue, claimNext, markActive, markDone, markFailed,
  scheduleRetry, cancel, retryFailed, setProgress, clearFinished, retryAllFailed,
  recoverStuckActive, RECOVER_GRACE_MS,
  type EnqueueEntry, type QueueState, type QueueItem,
} from '@mbd/storage/download-queue';
import { recordDownloads } from '@mbd/storage/history';
import { applyRefererRule, removeRefererRule, hasDnrPermission } from '@/extension/background/download/hotlink-rewrite';
import { scheduleSidecar } from '@/extension/background/download/sidecar-writer';

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
  return new Promise((resolve) =>
    chrome.downloads.download(
      { url, filename, saveAs: deps.getSaveAs(), conflictAction: 'uniquify' },
      (id) => resolve(chrome.runtime.lastError ? undefined : id),
    ),
  );
}

export function initQueueDispatcher(d: Deps): void {
  deps = d;
  if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; nudgeReadyAt = Infinity; }
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
  for (;;) {
    const claimed = await withState(async (s) => {
      const c = claimNext(s, max, Date.now());
      return c ? { state: c.state, value: c.item } : { state: s, value: null };
    });
    if (!claimed) break;
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

  const snapshot = await loadQueue();
  const item = snapshot.items.find((i) => i.downloadId === delta.id && i.status === 'active');
  if (!item) return;

  const errCode = current === 'interrupted' ? await interruptError(delta) : undefined;
  const forbidden = errCode === 'SERVER_FORBIDDEN';
  const cancelled = errCode === 'USER_CANCELED';
  const rewrite = forbidden && !item.useReferer && (await hasDnrPermission());

  const done = await withState(async (s) => {
    const cur = s.items.find((i) => i.id === item.id && i.status === 'active');
    if (!cur) return { state: s, value: null };
    if (current === 'complete') return { state: markDone(s, cur.id), value: cur };
    if (forbidden) {
      if (rewrite) {
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

  if (item.ruleId != null) await removeRefererRule(item.ruleId);
  if (done?.history) {
    void recordDownloads([{ ...done.history, time: Date.now(), downloadId: delta.id }]);
  }
  void pump();
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
    let dl: chrome.downloads.DownloadItem | undefined;
    try { [dl] = await chrome.downloads.search({ id: it.downloadId }); } catch { dl = undefined; }
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
    await handleDownloadChanged({ id: t.id, state: { current: t.state, previous: 'in_progress' } } as chrome.downloads.DownloadDelta);
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
    if (it.downloadId != null) {
      await new Promise<void>((resolve) => {
        try { chrome.downloads.cancel(it.downloadId as number, () => resolve()); } catch { resolve(); }
      });
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
    await withState(async (s) => ({ state: recoverStuckActive(s, now), value: null }));
    for (const it of stuckNoId) {
      if (it.ruleId != null) await removeRefererRule(it.ruleId);
    }
  }

  const actives = snapshot.items.filter((i) => i.status === 'active' && i.downloadId !== undefined);
  for (const item of actives) {
    let hit: chrome.downloads.DownloadItem | undefined;
    try {
      [hit] = await chrome.downloads.search({ id: item.downloadId });
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
