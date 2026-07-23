import type { HistoryEntry, FavouriteEntry } from '@mbd/core/types';
import { canonicalSrcKey } from '@mbd/core/collection/canonical';
import { withinByteBudget } from '@mbd/core/collection/byte-budget';

export const HISTORY_CAP = 500;
export const HISTORY_MAX_BYTES = 2_000_000;
export const FAVOURITES_CAP = 500;
export const FAVOURITES_MAX_BYTES = 1_000_000;

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

/** Merge new entries into existing: dedup by src (newest wins, front),
 *  newest-first, capped by count and by serialized size. Pure. */
export function mergeFavourites(
  existing: FavouriteEntry[],
  added: FavouriteEntry[],
): FavouriteEntry[] {
  const map = new Map<string, FavouriteEntry>();
  for (const entry of added) {
    const k = canonicalSrcKey(entry.src);
    const prev = map.get(k);
    if (!prev || entry.time > prev.time) map.set(k, entry);
  }
  for (const entry of existing) { const k = canonicalSrcKey(entry.src); if (!map.has(k)) map.set(k, entry); }
  const ranked = [...map.values()].sort((a, b) => b.time - a.time).slice(0, FAVOURITES_CAP);
  return withinByteBudget(ranked, FAVOURITES_MAX_BYTES);
}
