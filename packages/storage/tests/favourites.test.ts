import type { Mock } from 'vitest';
import {
  addFavourite, removeFavourite, clearFavourites, restoreFavourites,
  favouriteSrcSet, loadFavourites,
} from '@mbd/storage/favourites';
import { FavouriteEntry } from '@mbd/core/types';

const f = (src: string, time: number): FavouriteEntry =>
  ({ src, kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });

describe('loadFavourites — corrupt storage', () => {
  it('drops entries without a string src and coerces a bad time to 0', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({
      favourites: [{ src: 'a', time: 5 }, { type: 'no-src' }, { src: 'b' }, 'garbage', null],
    });
    const out = await loadFavourites();
    expect(out.map((x) => x.src)).toEqual(['a', 'b']);
    expect(out.find((x) => x.src === 'b')!.time).toBe(0);
  });
  it('treats a non-array stored value as no data', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({ favourites: 'corrupted-not-an-array' });
    expect(await loadFavourites()).toEqual([]);
  });
  it('treats a missing favourites key as no data', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({});
    expect(await loadFavourites()).toEqual([]);
  });
});

describe('favourites storage helpers', () => {
  beforeEach(() => {
    (chrome.storage.local.get as Mock).mockReset().mockResolvedValue({ favourites: [f('a', 1)] });
    (chrome.storage.local.set as Mock).mockReset().mockResolvedValue(undefined);
  });
  it('addFavourite merges and writes', async () => {
    await addFavourite(f('b', 2));
    const written = (chrome.storage.local.set as Mock).mock.calls[0][0].favourites;
    expect(written.map((x: FavouriteEntry) => x.src).sort()).toEqual(['a', 'b']);
  });
  it('removeFavourite drops the src', async () => {
    await removeFavourite('a');
    expect((chrome.storage.local.set as Mock).mock.calls[0][0].favourites).toEqual([]);
  });
  it('clearFavourites writes an empty array', async () => {
    await clearFavourites();
    expect((chrome.storage.local.set as Mock).mock.calls[0][0].favourites).toEqual([]);
  });
  it('favouriteSrcSet returns a SrcKeySet matching the stored srcs', async () => {
    const set = await favouriteSrcSet();
    expect(set.has('a')).toBe(true);
    expect(set.size).toBe(1);
  });
  it('recovers the write chain after a rejected write, so a later write still applies', async () => {
    (chrome.storage.local.set as Mock).mockImplementationOnce(() => Promise.reject(new Error('quota exceeded')));
    await addFavourite(f('will-fail', 9));
    await addFavourite(f('after-failure', 10));
    const calls = (chrome.storage.local.set as Mock).mock.calls;
    const lastWritten = calls[calls.length - 1][0].favourites as FavouriteEntry[];
    expect(lastWritten.map((x) => x.src).sort()).toEqual(['a', 'after-failure']);
  });
});

describe('restoreFavourites', () => {
  it('replaces favourites with the normalized imported list', async () => {
    let store: FavouriteEntry[] = [];
    (chrome.storage.local.set as Mock).mockReset().mockImplementation(async (obj: Record<string, FavouriteEntry[]>) => {
      store = obj.favourites;
    });
    await restoreFavourites([f('a', 1), f('b', 3), f('a', 9)]);
    expect(store.map((x) => x.src)).toEqual(['a', 'b']);
    expect(store[0].time).toBe(9);
  });
});
