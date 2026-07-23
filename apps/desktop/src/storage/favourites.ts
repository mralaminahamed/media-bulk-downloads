// Value-import from the pre-bundled ESM (deno desktop can't resolve bare
// @mbd/core source imports — see docs/runtime-recipe.md). Type-only imports stay
// on @mbd/core/types (erased at runtime, no resolution needed).
import { mergeFavourites, canonicalSrcKey, SrcKeySet } from '../core-bundle/download-name.gen.js';
import type { FavouriteEntry } from '@mbd/core/types';
import type { Store } from './kv.ts';

const KEY = 'favourites';

export async function loadFavourites(store: Store): Promise<FavouriteEntry[]> {
  return (await store.durableGet<FavouriteEntry[]>(KEY)) ?? [];
}

export async function addFavourite(store: Store, entry: FavouriteEntry): Promise<void> {
  await store.durableSet(KEY, mergeFavourites(await loadFavourites(store), [entry]));
}

export async function removeFavourite(store: Store, src: string): Promise<void> {
  const k = canonicalSrcKey(src);
  await store.durableSet(KEY, (await loadFavourites(store)).filter((e) => canonicalSrcKey(e.src) !== k));
}

export async function clearFavourites(store: Store): Promise<void> {
  await store.durableSet(KEY, []);
}

/** SrcKeySet instance type. The bundle is a plain .js file (no wired-up .d.ts
 *  companion for it), so its class exports type-check via checkJs inference
 *  rather than a hand-written ambient declaration — `InstanceType<typeof X>`
 *  reads that inferred shape without redeclaring it. */
export type FavouriteSrcKeySet = InstanceType<typeof SrcKeySet>;

/** SrcKeySet over current favourites, so callers can test `.has(item.src)`
 *  across CDN variants without touching canonicalSrcKey themselves. */
export async function favouriteKeys(store: Store): Promise<FavouriteSrcKeySet> {
  return SrcKeySet.from((await loadFavourites(store)).map((e) => e.src));
}
