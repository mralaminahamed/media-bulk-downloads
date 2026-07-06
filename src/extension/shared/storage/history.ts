import { HistoryEntry } from '@/types';

export const HISTORY_KEY = 'downloadHistory';
export const HISTORY_CAP = 500;
// A count cap alone doesn't bound bytes: an entry's `src` can be a full base64
// data URL, so 500 of them can blow the shared chrome.storage.local quota (~5MB,
// no unlimitedStorage). Also bound the newest-first list by serialized size.
export const HISTORY_MAX_BYTES = 2_000_000;

/** Keep newest-first entries until the byte budget is hit; always keeps at least one. */
function withinByteBudget<T>(entries: T[], maxBytes: number): T[] {
  let total = 0;
  const out: T[] = [];
  for (const entry of entries) {
    total += JSON.stringify(entry).length;
    if (total > maxBytes && out.length) break;
    out.push(entry);
  }
  return out;
}

/** Merge new entries into existing: dedup by src (newest wins, front), sorted
 *  newest-first, capped by count and by serialized size. Pure. */
export function mergeHistory(existing: HistoryEntry[], added: HistoryEntry[]): HistoryEntry[] {
  const map = new Map<string, HistoryEntry>();
  for (const entry of added) map.set(entry.src, entry);
  for (const entry of existing) if (!map.has(entry.src)) map.set(entry.src, entry);
  const ranked = [...map.values()].sort((a, b) => b.time - a.time).slice(0, HISTORY_CAP);
  return withinByteBudget(ranked, HISTORY_MAX_BYTES);
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const raw = (result as Record<string, unknown>)[HISTORY_KEY];
  if (!Array.isArray(raw)) return [];
  // Tolerate corrupt storage: an entry with no string `src` would collapse to a
  // single undefined key in mergeHistory, and a non-numeric `time` would make the
  // sort unstable. Drop the former and coerce the latter.
  return raw
    .filter((e): e is HistoryEntry => !!e && typeof e === 'object' && typeof (e as HistoryEntry).src === 'string')
    .map((e) => ({ ...e, time: Number((e as HistoryEntry).time) || 0 }));
}

// Serialize read-modify-write ops so concurrent mutations can't clobber each other.
let writeChain: Promise<void> = Promise.resolve();
function serialize(task: () => Promise<void>): Promise<void> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

export async function recordDownloads(added: HistoryEntry[]): Promise<void> {
  if (!added.length) return;
  return serialize(async () => {
    const merged = mergeHistory(await loadHistory(), added);
    await chrome.storage.local.set({ [HISTORY_KEY]: merged });
  });
}

export async function removeEntry(src: string): Promise<void> {
  return serialize(async () => {
    const next = (await loadHistory()).filter((e) => e.src !== src);
    await chrome.storage.local.set({ [HISTORY_KEY]: next });
  });
}

export async function clearHistory(): Promise<void> {
  return serialize(async () => {
    await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  });
}

/** Replace history with an imported list, normalized (dedup/sort/cap/byte-budget). */
export async function restoreHistory(entries: HistoryEntry[]): Promise<void> {
  return serialize(async () => {
    await chrome.storage.local.set({ [HISTORY_KEY]: mergeHistory([], entries) });
  });
}

export async function downloadedSrcSet(): Promise<Set<string>> {
  return new Set((await loadHistory()).map((e) => e.src));
}

/**
 * The srcs from history whose downloaded file still exists on disk, given a
 * predicate that reports on-disk existence by `chrome.downloads` id (the caller
 * runs the actual `chrome.downloads.search`, which only the background realm can).
 * Pure, so it's testable without the API.
 *
 * A tracked entry (has a `downloadId`) is kept only when its file still exists —
 * so an item the user deleted from disk stops counting as already-downloaded and
 * becomes re-downloadable. Legacy entries recorded before download-id tracking
 * have no id to check, so they're kept as-is rather than surprise-unmarked.
 */
export function srcsStillOnDisk(
  history: HistoryEntry[],
  existsById: (id: number) => boolean,
): string[] {
  return history
    .filter((e) => e.downloadId === undefined || existsById(e.downloadId))
    .map((e) => e.src);
}
