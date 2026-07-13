import type { HistoryEntry } from '@mbd/core/types';
import { durableSet } from '@mbd/storage/idb';

export type QueueStatus = 'queued' | 'active' | 'done' | 'failed';
export type HistoryDraft = Omit<HistoryEntry, 'time' | 'downloadId'>;

export interface QueueItem {
  id: string;
  url: string;
  filename: string;
  status: QueueStatus;
  attempts: number;
  error?: string;
  downloadId?: number;
  readyAt: number;
  addedAt: number;
  /** Opaque to the reducer; the dispatcher uses it to write history on completion. */
  history?: HistoryDraft;
  /** Apply the Referer-rewrite DNR rule on this item's next dispatch (#197). Set
   *  after a 403 when the rewrite retry is authorised. */
  useReferer?: boolean;
  /** This item failed with a hotlink 403 and no Referer rewrite was applied — the
   *  popup surfaces an opt-in "Retry with page referer" for it. */
  hotlink?: boolean;
  /** Id of the session DNR rule active for this item's in-flight download, so the
   *  dispatcher can tear it down when the download settles. Dispatcher-managed. */
  ruleId?: number;
  /** Live progress for an active item (bytes fetched so far / total, from the
   *  dispatcher's chrome.downloads poll). Absent until the first poll; totalBytes
   *  absent when Chrome doesn't know the size. */
  bytesReceived?: number;
  totalBytes?: number;
}

export interface QueueState {
  items: QueueItem[];
  paused: boolean;
}

export interface EnqueueEntry {
  url: string;
  filename: string;
  history?: HistoryDraft;
}

export const MAX_ATTEMPTS = 3;
export const QUEUE_KEY = 'downloadQueue';

export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** (attempts - 1), 30000);
}

export function emptyQueue(): QueueState {
  return { items: [], paused: false };
}

// Non-crypto stable id; a rolling sequence suffix avoids collisions when many
// items are enqueued within the same millisecond (`now` alone isn't unique).
let seq = 0;
function makeId(now: number): string {
  seq = (seq + 1) % 1_000_000;
  return `${now.toString(36)}-${seq.toString(36)}`;
}

const isLive = (i: QueueItem): boolean => i.status === 'queued' || i.status === 'active';

/** Keep every live item and the most recent {@link FINISHED_CAP} finished
 *  (done/failed/cancelled) ones, so a long session can't grow the persisted
 *  queue without bound (each save re-serializes the whole array). */
export const FINISHED_CAP = 200;
function pruneFinished(items: QueueItem[]): QueueItem[] {
  const finished = items.filter((i) => !isLive(i));
  if (finished.length <= FINISHED_CAP) return items;
  const keep = new Set(
    [...finished].sort((a, b) => b.addedAt - a.addedAt).slice(0, FINISHED_CAP),
  );
  return items.filter((i) => isLive(i) || keep.has(i));
}

export function enqueue(state: QueueState, entries: EnqueueEntry[], now: number): QueueState {
  const seen = new Set(state.items.filter(isLive).map((i) => `${i.url} ${i.filename}`));
  const additions: QueueItem[] = [];
  for (const e of entries) {
    const key = `${e.url} ${e.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push({
      id: makeId(now), url: e.url, filename: e.filename, status: 'queued',
      attempts: 0, readyAt: now, addedAt: now, history: e.history,
    });
  }
  return { ...state, items: pruneFinished([...state.items, ...additions]) };
}

export function activeCount(state: QueueState): number {
  return state.items.filter((i) => i.status === 'active').length;
}

export function claimNext(
  state: QueueState, max: number, now: number,
): { state: QueueState; item: QueueItem } | null {
  if (state.paused) return null;
  if (activeCount(state) >= max) return null;
  const idx = state.items.findIndex((i) => i.status === 'queued' && i.readyAt <= now);
  if (idx === -1) return null;
  const item: QueueItem = { ...state.items[idx], status: 'active' };
  const items = state.items.slice();
  items[idx] = item;
  return { state: { ...state, items }, item };
}

function patch(state: QueueState, id: string, fn: (i: QueueItem) => QueueItem): QueueState {
  const idx = state.items.findIndex((i) => i.id === id);
  if (idx === -1) return state;
  const items = state.items.slice();
  items[idx] = fn(items[idx]);
  return { ...state, items };
}

export function markActive(state: QueueState, id: string, downloadId: number): QueueState {
  return patch(state, id, (i) => ({ ...i, status: 'active', downloadId }));
}

export function markDone(state: QueueState, id: string): QueueState {
  return patch(state, id, (i) => ({ ...i, status: 'done' }));
}

export function markFailed(state: QueueState, id: string, error: string, hotlink = false): QueueState {
  return patch(state, id, (i) => ({ ...i, status: 'failed', error, hotlink: hotlink || undefined }));
}

export function scheduleRetry(state: QueueState, id: string, now: number): QueueState {
  return patch(state, id, (i) => {
    const attempts = i.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      return { ...i, attempts, status: 'failed', error: i.error ?? 'retry limit reached', downloadId: undefined };
    }
    return { ...i, attempts, status: 'queued', readyAt: now + backoffMs(attempts), downloadId: undefined, bytesReceived: undefined, totalBytes: undefined };
  });
}

export function cancel(state: QueueState, target: string): QueueState {
  if (target === 'all') return { ...state, items: state.items.filter((i) => !isLive(i)) };
  return { ...state, items: state.items.filter((i) => i.id !== target) };
}

export function retryFailed(state: QueueState, id: string, now: number, useReferer = false): QueueState {
  return patch(state, id, (i) =>
    i.status === 'failed'
      ? {
          ...i, status: 'queued', attempts: 0, error: undefined, readyAt: now,
          downloadId: undefined, hotlink: undefined, useReferer: useReferer || undefined,
          bytesReceived: undefined, totalBytes: undefined,
        }
      : i,
  );
}

/** Update the live byte progress of the active item owning `downloadId`. Returns
 *  the same state reference when no active item matches or nothing changed, so
 *  the dispatcher can skip a redundant storage write. */
export function setProgress(state: QueueState, downloadId: number, bytesReceived: number, totalBytes?: number): QueueState {
  const idx = state.items.findIndex((i) => i.downloadId === downloadId && i.status === 'active');
  if (idx === -1) return state;
  const cur = state.items[idx];
  if (cur.bytesReceived === bytesReceived && cur.totalBytes === totalBytes) return state;
  const items = state.items.slice();
  items[idx] = { ...cur, bytesReceived, totalBytes };
  return { ...state, items };
}

/** Re-queue every failed item at once (bulk plain retry — no Referer rewrite). */
export function retryAllFailed(state: QueueState, now: number): QueueState {
  return {
    ...state,
    items: state.items.map((i) =>
      i.status === 'failed'
        ? { ...i, status: 'queued' as const, attempts: 0, error: undefined, readyAt: now,
            downloadId: undefined, hotlink: undefined, useReferer: undefined,
            bytesReceived: undefined, totalBytes: undefined }
        : i,
    ),
  };
}

export function clearFinished(state: QueueState): QueueState {
  return { ...state, items: state.items.filter(isLive) };
}

export async function loadQueue(): Promise<QueueState> {
  const raw = await chrome.storage.local.get(QUEUE_KEY);
  const v = raw[QUEUE_KEY];
  if (v && typeof v === 'object' && Array.isArray((v as QueueState).items)) {
    return { items: (v as QueueState).items, paused: Boolean((v as QueueState).paused) };
  }
  return emptyQueue();
}

export async function saveQueue(state: QueueState): Promise<void> {
  await durableSet(QUEUE_KEY, state);
}
