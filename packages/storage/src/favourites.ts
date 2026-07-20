import { FavouriteEntry } from '@mbd/core/types';
import { canonicalSrcKey, SrcKeySet } from '@mbd/core/collection/canonical';
import { durableSet } from '@mbd/storage/idb';
import { withinByteBudget } from '@mbd/storage/byte-budget';

export const FAVOURITES_KEY = 'favourites';
export const FAVOURITES_CAP = 500;
export const FAVOURITES_MAX_BYTES = 1_000_000;

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

export async function loadFavourites(): Promise<FavouriteEntry[]> {
  const result = await chrome.storage.local.get(FAVOURITES_KEY);
  const raw = (result as Record<string, unknown>)[FAVOURITES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is FavouriteEntry =>
      !!e && typeof e === 'object' && typeof (e as FavouriteEntry).src === 'string')
    .map((e) => ({ ...e, time: Number((e as FavouriteEntry).time) || 0 }));
}

let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

/** Resolves to whether the write persisted (see durableSet). */
export async function addFavourite(entry: FavouriteEntry): Promise<boolean> {
  return serialize(async () => {
    const merged = mergeFavourites(await loadFavourites(), [entry]);
    return durableSet(FAVOURITES_KEY, merged);
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
