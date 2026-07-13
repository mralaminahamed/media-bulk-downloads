import type { Mock } from 'vitest';
import {
  mergeFavourites, addFavourite, removeFavourite, clearFavourites, restoreFavourites,
  favouriteSrcSet, loadFavourites, FAVOURITES_CAP,
} from '@/extension/shared/storage/favourites';
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

describe('mergeFavourites', () => {
  it('dedups by src, newest wins and moves to front', () => {
    const out = mergeFavourites([f('a', 1), f('b', 2)], [f('a', 5)]);
    expect(out.map((x) => x.src)).toEqual(['a', 'b']);
    expect(out[0].time).toBe(5);
  });
  it('sorts newest-first and caps at FAVOURITES_CAP', () => {
    const many = Array.from({ length: FAVOURITES_CAP + 10 }, (_, i) => f(`s${i}`, i));
    const out = mergeFavourites(many, []);
    expect(out).toHaveLength(FAVOURITES_CAP);
    expect(out[0].time).toBe(FAVOURITES_CAP + 9);
  });
  it('collapses favourites whose src canonicalizes to the same key (CDN query variants), newest wins', () => {
    const older = f('https://cdn.example.com/img/a.jpg?sig=1', 1);
    const newer = f('https://cdn.example.com/img/a.jpg?sig=2', 5);
    expect(mergeFavourites([older], [newer])).toEqual([newer]);
  });
  it('within the added batch, newest time wins for a duplicate key (not array order)', () => {
    const out = mergeFavourites([], [f('a', 1), f('a', 9), f('a', 3)]);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(9); // 9, not the array-order-last 3
  });
  it('keeps only the first entry when it alone exceeds the byte budget, drops later overflow', () => {
    // Regression guard for withinByteBudget's `total > maxBytes && out.length` gate:
    // out.length is 0 while budgeting the very first entry (e.g. a huge base64 data
    // URL), so a single oversized favourite must never be dropped outright.
    const big = 'data:image/png;base64,' + 'A'.repeat(2_500_000);
    const first = f(big, 2);
    const second = f(big + 'B', 1); // distinct key so it doesn't just dedup away
    expect(mergeFavourites([], [first, second])).toEqual([first]);
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
    await expect(addFavourite(f('will-fail', 9))).rejects.toThrow('quota exceeded');
    // The failed write must not leave writeChain permanently rejected — this
    // write, chained after it, has to still go through against the base mock.
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
