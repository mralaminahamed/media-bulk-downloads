import { FavouriteEntry } from '@/types';

export const FAVOURITES_KEY = 'favourites';
export const FAVOURITES_CAP = 500;

/** Merge new entries into existing: dedup by src (newest wins, front),
 *  newest-first, capped. Pure. */
export function mergeFavourites(
  existing: FavouriteEntry[],
  added: FavouriteEntry[],
): FavouriteEntry[] {
  const map = new Map<string, FavouriteEntry>();
  for (const entry of added) map.set(entry.src, entry);
  for (const entry of existing) if (!map.has(entry.src)) map.set(entry.src, entry);
  return [...map.values()].sort((a, b) => b.time - a.time).slice(0, FAVOURITES_CAP);
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
    await chrome.storage.local.set({ [FAVOURITES_KEY]: merged });
  });
}

export async function removeFavourite(src: string): Promise<void> {
  return serialize(async () => {
    const next = (await loadFavourites()).filter((e) => e.src !== src);
    await chrome.storage.local.set({ [FAVOURITES_KEY]: next });
  });
}

export async function clearFavourites(): Promise<void> {
  return serialize(async () => {
    await chrome.storage.local.set({ [FAVOURITES_KEY]: [] });
  });
}

export async function favouriteSrcSet(): Promise<Set<string>> {
  return new Set((await loadFavourites()).map((e) => e.src));
}
