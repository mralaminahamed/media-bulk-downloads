import { describe, it, expect } from 'vitest';
import { mergeHistory, mergeFavourites, HISTORY_CAP, HISTORY_MAX_BYTES, FAVOURITES_CAP } from '../../src/collection/entry-merge';
import { HistoryEntry, FavouriteEntry } from '../../src/types';

const e = (src: string, time: number): HistoryEntry =>
  ({ src, filename: `${src}.jpg`, kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });

describe('mergeHistory', () => {
  it('dedups by src, newest wins and moves to front', () => {
    const out = mergeHistory([e('a', 1), e('b', 2)], [e('a', 5)]);
    expect(out.map((x) => x.src)).toEqual(['a', 'b']);
    expect(out[0].time).toBe(5);
  });
  it('sorts newest-first and caps at HISTORY_CAP', () => {
    const many = Array.from({ length: HISTORY_CAP + 10 }, (_, i) => e(`s${i}`, i));
    const out = mergeHistory(many, []);
    expect(out).toHaveLength(HISTORY_CAP);
    expect(out[0].time).toBe(HISTORY_CAP + 9);
  });
  it('bounds the list by serialized byte budget (big base64-style srcs), newest kept', () => {
    const chunk = 'x'.repeat(Math.ceil(HISTORY_MAX_BYTES / 3));
    const big = (id: string, time: number): HistoryEntry =>
      ({ src: `https://p/${id}/${chunk}`, filename: 'f.jpg', kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });
    const out = mergeHistory([big('a', 1), big('b', 2), big('c', 3), big('d', 4)], []);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.length).toBeLessThan(4);
    expect(out[0].time).toBe(4);
  });
});

const f = (src: string, time: number): FavouriteEntry =>
  ({ src, kind: 'image', type: 'jpeg', sourcePageUrl: 'https://p', time });

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
    expect(out[0].time).toBe(9);
  });
  it('keeps only the first entry when it alone exceeds the byte budget, drops later overflow', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(2_500_000);
    const first = f(big, 2);
    const second = f(big + 'B', 1);
    expect(mergeFavourites([], [first, second])).toEqual([first]);
  });
});
