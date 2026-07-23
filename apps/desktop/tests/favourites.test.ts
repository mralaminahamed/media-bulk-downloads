import { assert, assertEquals } from 'jsr:@std/assert';
import { openStore } from '../src/storage/kv.ts';
import { addFavourite, removeFavourite, clearFavourites, loadFavourites, favouriteKeys } from '../src/storage/favourites.ts';
import type { FavouriteEntry } from '@mbd/core/types';

const f = (src: string, time: number, extra: Partial<FavouriteEntry> = {}): FavouriteEntry => ({
  src,
  kind: 'image' as const,
  type: 'image/jpeg',
  sourcePageUrl: 'https://x/',
  time,
  ...extra,
});

Deno.test('favourites records, dedups by canonical key, removes, clears', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await addFavourite(store, f('https://x/a.jpg?sig=1', 1));
  await addFavourite(store, f('https://x/a.jpg?sig=2', 2)); // same image, newer
  let favourites = await loadFavourites(store);
  assertEquals(favourites.length, 1);
  assertEquals(favourites[0].time, 2);
  await removeFavourite(store, favourites[0].src);
  assertEquals((await loadFavourites(store)).length, 0);
  await addFavourite(store, f('https://x/b.jpg', 3));
  await clearFavourites(store);
  assertEquals((await loadFavourites(store)).length, 0);
  store.close();
});

Deno.test('favouriteKeys returns a SrcKeySet that canonicalizes across CDN variants', async () => {
  const store = await openStore(await Deno.makeTempFile({ suffix: '.kv' }));
  await addFavourite(store, f('https://x/a.jpg?sig=1', 1));
  const keys = await favouriteKeys(store);
  assert(keys.has('https://x/a.jpg?sig=999'));
  store.close();
});
