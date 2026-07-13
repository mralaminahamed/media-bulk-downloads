import { FavouriteEntry } from '@mbd/core/types';
import { canonicalSrcKey, SrcKeySet } from '@mbd/core/collection/canonical';
import { durableSet } from '@mbd/storage/idb';

export const FAVOURITES_KEY = 'favourites';
export const FAVOURITES_CAP = 500;
// A count cap alone doesn't bound bytes: an entry's `src` can be a full base64
// data URL, so 500 of them can blow the shared chrome.storage.local quota (~5MB,
// no unlimitedStorage). Also bound the newest-first list by serialized size.
// The per-store byte caps are sized to co-exist under the shared quota:
// history 2MB + favourites 1MB + excluded 0.5MB = 3.5MB, leaving headroom for
// the queue, per-host, and settings keys.
export const FAVOURITES_MAX_BYTES = 1_000_000;

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

/** Merge new entries into existing: dedup by src (newest wins, front),
 *  newest-first, capped by count and by serialized size. Pure. */
export function mergeFavourites(
  existing: FavouriteEntry[],
  added: FavouriteEntry[],
): FavouriteEntry[] {
  // Keyed by canonical src so re-adding the same image with a fresh CDN query
  // signature doesn't create a duplicate favourite.
  const map = new Map<string, FavouriteEntry>();
  // Newest-wins even for duplicate keys WITHIN `added` (e.g. a re-assembled or
  // hand-edited backup), not just array-order-last.
  for (const entry of added) {
    const k = canonicalSrcKey(entry.src);
    const prev = map.get(k);
    if (!prev || entry.time > prev.time) map.set(k, entry);
  }
  for (const entry of existing) { const k = canonicalSrcKey(entry.src); if (!map.has(k)) map.set(k, entry); }
  const ranked = [...map.values()].sort((a, b) => b.time - a.time).slice(0, FAVOURITES_CAP);
  return withinByteBudget(ranked, FAVOURITES_MAX_BYTES);
}

export async function loadFavourites(): Promise<FavouriteEntry[]> {
  const result = await chrome.storage.local.get(FAVOURITES_KEY);
  const raw = (result as Record<string, unknown>)[FAVOURITES_KEY];
  if (!Array.isArray(raw)) return [];
  // Tolerate corrupt storage: an entry with no string `src` would collapse to a
  // single undefined key in mergeFavourites, and a non-numeric `time` would make
  // the sort unstable. Drop the former and coerce the latter.
  return raw
    .filter((e): e is FavouriteEntry =>
      !!e && typeof e === 'object' && typeof (e as FavouriteEntry).src === 'string')
    .map((e) => ({ ...e, time: Number((e as FavouriteEntry).time) || 0 }));
}

// Serialize read-modify-write ops so concurrent mutations can't clobber each other.
let writeChain: Promise<void> = Promise.resolve();
function serialize(task: () => Promise<void>): Promise<void> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

export async function addFavourite(entry: FavouriteEntry): Promise<void> {
  return serialize(async () => {
    const merged = mergeFavourites(await loadFavourites(), [entry]);
    await durableSet(FAVOURITES_KEY, merged);
  });
}

export async function removeFavourite(src: string): Promise<void> {
  return serialize(async () => {
    const next = (await loadFavourites()).filter((e) => canonicalSrcKey(e.src) !== canonicalSrcKey(src));
    await durableSet(FAVOURITES_KEY, next);
  });
}

/** Replace favourites with an imported list, normalized (dedup/sort/cap/byte-budget). */
export async function restoreFavourites(entries: FavouriteEntry[]): Promise<void> {
  return serialize(async () => {
    await durableSet(FAVOURITES_KEY, mergeFavourites([], entries));
  });
}

export async function clearFavourites(): Promise<void> {
  return serialize(async () => {
    await durableSet(FAVOURITES_KEY, []);
  });
}

export async function favouriteSrcSet(): Promise<SrcKeySet> {
  return SrcKeySet.from((await loadFavourites()).map((e) => e.src));
}
