import {
  mergeFavourites, addFavourite, removeFavourite, clearFavourites,
  favouriteSrcSet, loadFavourites, FAVOURITES_CAP,
} from '@/extension/shared/favourites';
import { FavouriteEntry } from '@/types';

const f = (src: string, time: number): FavouriteEntry =>
  ({ src, kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });

describe('loadFavourites — corrupt storage', () => {
  it('drops entries without a string src and coerces a bad time to 0', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({
      favourites: [{ src: 'a', time: 5 }, { type: 'no-src' }, { src: 'b' }, 'garbage', null],
    });
    const out = await loadFavourites();
    expect(out.map((x) => x.src)).toEqual(['a', 'b']);
    expect(out.find((x) => x.src === 'b')!.time).toBe(0);
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
});

describe('favourites storage helpers', () => {
  beforeEach(() => {
    (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({ favourites: [f('a', 1)] });
    (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
  });
  it('addFavourite merges and writes', async () => {
    await addFavourite(f('b', 2));
    const written = (chrome.storage.local.set as jest.Mock).mock.calls[0][0].favourites;
    expect(written.map((x: FavouriteEntry) => x.src).sort()).toEqual(['a', 'b']);
  });
  it('removeFavourite drops the src', async () => {
    await removeFavourite('a');
    expect((chrome.storage.local.set as jest.Mock).mock.calls[0][0].favourites).toEqual([]);
  });
  it('clearFavourites writes an empty array', async () => {
    await clearFavourites();
    expect((chrome.storage.local.set as jest.Mock).mock.calls[0][0].favourites).toEqual([]);
  });
  it('favouriteSrcSet returns the src set', async () => {
    expect(await favouriteSrcSet()).toEqual(new Set(['a']));
  });
});
