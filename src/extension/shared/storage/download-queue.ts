import type { HistoryEntry } from '@/types';

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
  return { ...state, items: [...state.items, ...additions] };
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
    return { ...i, attempts, status: 'queued', readyAt: now + backoffMs(attempts), downloadId: undefined };
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
        }
      : i,
  );
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
  await chrome.storage.local.set({ [QUEUE_KEY]: state });
}
