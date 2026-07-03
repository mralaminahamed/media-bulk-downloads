import { HistoryEntry } from '@/types';

export const HISTORY_KEY = 'downloadHistory';
export const HISTORY_CAP = 500;

/** Merge new entries into existing: dedup by src (newest wins, front), sorted
 *  newest-first, capped. Pure. */
export function mergeHistory(existing: HistoryEntry[], added: HistoryEntry[]): HistoryEntry[] {
  const map = new Map<string, HistoryEntry>();
  for (const entry of added) map.set(entry.src, entry);
  for (const entry of existing) if (!map.has(entry.src)) map.set(entry.src, entry);
  return [...map.values()].sort((a, b) => b.time - a.time).slice(0, HISTORY_CAP);
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const raw = (result as Record<string, unknown>)[HISTORY_KEY];
  return Array.isArray(raw) ? (raw as HistoryEntry[]) : [];
}

export async function recordDownloads(added: HistoryEntry[]): Promise<void> {
  if (!added.length) return;
  const merged = mergeHistory(await loadHistory(), added);
  await chrome.storage.local.set({ [HISTORY_KEY]: merged });
}

export async function removeEntry(src: string): Promise<void> {
  const next = (await loadHistory()).filter((e) => e.src !== src);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

export async function downloadedSrcSet(): Promise<Set<string>> {
  return new Set((await loadHistory()).map((e) => e.src));
}
