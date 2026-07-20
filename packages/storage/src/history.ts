import { HistoryEntry } from '@mbd/core/types';
import { canonicalSrcKey } from '@mbd/core/collection/canonical';
import { durableSet } from '@mbd/storage/idb';
import { withinByteBudget } from '@mbd/storage/byte-budget';

export const HISTORY_KEY = 'downloadHistory';
export const HISTORY_CAP = 500;
export const HISTORY_MAX_BYTES = 2_000_000;

/** Merge new entries into existing: dedup by src (newest wins, front), sorted
 *  newest-first, capped by count and by serialized size. Pure. */
export function mergeHistory(existing: HistoryEntry[], added: HistoryEntry[]): HistoryEntry[] {
  const map = new Map<string, HistoryEntry>();
  for (const entry of added) {
    const k = canonicalSrcKey(entry.src);
    const prev = map.get(k);
    if (!prev || entry.time > prev.time) map.set(k, entry);
  }
  for (const entry of existing) { const k = canonicalSrcKey(entry.src); if (!map.has(k)) map.set(k, entry); }
  const ranked = [...map.values()].sort((a, b) => b.time - a.time).slice(0, HISTORY_CAP);
  return withinByteBudget(ranked, HISTORY_MAX_BYTES);
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const raw = (result as Record<string, unknown>)[HISTORY_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is HistoryEntry => !!e && typeof e === 'object' && typeof (e as HistoryEntry).src === 'string')
    .map((e) => ({ ...e, time: Number((e as HistoryEntry).time) || 0 }));
}

let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

/** Resolves to whether the write persisted (see durableSet); `true` on an empty no-op. */
export async function recordDownloads(added: HistoryEntry[]): Promise<boolean> {
  if (!added.length) return true;
  return serialize(async () => {
    const merged = mergeHistory(await loadHistory(), added);
    return durableSet(HISTORY_KEY, merged);
  });
}

export async function removeEntry(src: string): Promise<void> {
  return serialize(async () => {
    const next = (await loadHistory()).filter((e) => canonicalSrcKey(e.src) !== canonicalSrcKey(src));
    await durableSet(HISTORY_KEY, next);
  });
}

export async function clearHistory(): Promise<void> {
  return serialize(async () => {
    await durableSet(HISTORY_KEY, []);
  });
}

/** Replace history with an imported list, normalized (dedup/sort/cap/byte-budget). */
export async function restoreHistory(entries: HistoryEntry[]): Promise<void> {
  return serialize(async () => {
    await durableSet(HISTORY_KEY, mergeHistory([], entries));
  });
}

export type DiskState = 'exists' | 'deleted' | 'unknown';

/**
 * The srcs from history whose downloaded file has NOT been positively reported gone.
 * `stateById(id)` returns 'exists' (browser knows it, file present), 'deleted' (browser
 * knows it, file removed), or 'unknown' (browser no longer has the record — e.g. the user
 * cleared Chrome's download history). Only 'deleted' drops an entry; 'unknown' keeps it
 * (trust our own record), so a still-on-disk file isn't wrongly re-offered. Legacy entries
 * with no downloadId are always kept.
 */
export function srcsStillOnDisk(
  history: HistoryEntry[],
  stateById: (id: number) => DiskState,
): string[] {
  return history
    .filter((e) => e.downloadId === undefined || stateById(e.downloadId) !== 'deleted')
    .map((e) => e.src);
}
