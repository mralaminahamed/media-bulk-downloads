import type { Mock } from 'vitest';
import {
  mergeExcluded, loadExcluded, addExcluded, removeExcluded, clearExcluded, restoreExcluded,
  excludedMatchers, EXCLUDED_KEY, EXCLUDED_CAP,
} from '@mbd/storage/excluded';
import { ExcludedEntry } from '@mbd/core/types';

const e = (value: string, kind: 'url' | 'host', time = 1): ExcludedEntry => ({ value, kind, time });

describe('mergeExcluded', () => {
  it('dedups by kind+value, newest wins, newest-first', () => {
    const out = mergeExcluded([e('a', 'url', 1)], [e('a', 'url', 5), e('cdn.x', 'host', 3)]);
    expect(out).toEqual([e('a', 'url', 5), e('cdn.x', 'host', 3)]);
  });
  it('keeps a url and a host of the same value as distinct entries', () => {
    const out = mergeExcluded([], [e('x', 'url', 1), e('x', 'host', 2)]);
    expect(out).toHaveLength(2);
  });
  it('caps at EXCLUDED_CAP', () => {
    const many = Array.from({ length: EXCLUDED_CAP + 10 }, (_, i) => e(`u${i}`, 'url', i));
    expect(mergeExcluded([], many)).toHaveLength(EXCLUDED_CAP);
  });
  it('collapses url entries that canonicalize to the same key (CDN query variants), newest wins', () => {
    const older = e('https://cdn.example.com/img/a.jpg?sig=1', 'url', 1);
    const newer = e('https://cdn.example.com/img/a.jpg?sig=2', 'url', 5);
    const out = mergeExcluded([older], [newer]);
    expect(out).toEqual([newer]);
  });
  it('keeps only the first entry when it alone exceeds the byte budget, drops later overflow', () => {
    const big = 'x'.repeat(2_500_000);
    const first = e(big, 'url', 2);
    const second = e(big + 'y', 'url', 1);
    const out = mergeExcluded([], [first, second]);
    expect(out).toEqual([first]);
  });
});

describe('storage round-trips', () => {
  beforeEach(async () => { await clearExcluded(); });

  it('add then load', async () => {
    await addExcluded(e('https://x/a.png', 'url', 2));
    await addExcluded(e('cdn.ads.com', 'host', 3));
    const all = await loadExcluded();
    expect(all.map((x) => x.value).sort()).toEqual(['cdn.ads.com', 'https://x/a.png']);
  });
  it('remove targets kind+value', async () => {
    await addExcluded(e('x', 'url', 1));
    await addExcluded(e('x', 'host', 1));
    await removeExcluded('url', 'x');
    const all = await loadExcluded();
    expect(all).toEqual([e('x', 'host', 1)]);
  });
  it('remove of a host entry matches by exact value, not canonical key, and spares a url of the same string', async () => {
    await addExcluded(e('cdn.ads.com', 'host', 1));
    await addExcluded(e('cdn.ads.com', 'url', 2));
    await removeExcluded('host', 'cdn.ads.com');
    expect(await loadExcluded()).toEqual([e('cdn.ads.com', 'url', 2)]);
  });
  it('remove of a url entry matches by canonical key across query variants', async () => {
    await addExcluded(e('https://cdn.example.com/img/a.jpg?token=abc', 'url', 1));
    await removeExcluded('url', 'https://cdn.example.com/img/a.jpg?token=xyz');
    expect(await loadExcluded()).toEqual([]);
  });
  it('restore replaces', async () => {
    await addExcluded(e('old', 'url', 1));
    await restoreExcluded([e('new', 'host', 9)]);
    expect(await loadExcluded()).toEqual([e('new', 'host', 9)]);
  });
  it('excludedMatchers builds url + host sets, reducing hosts to the registrable domain', async () => {
    await addExcluded(e('https://x/a.png', 'url', 1));
    await addExcluded(e('cdn.ads.com', 'host', 2));
    const m = await excludedMatchers();
    expect(m.urls.has('https://x/a.png')).toBe(true);
    expect(m.hosts.has('ads.com')).toBe(true);
    expect(m.urls.has('cdn.ads.com')).toBe(false);
  });
  it('loadExcluded drops corrupt entries and coerces time (including a missing time field to 0)', async () => {
    await chrome.storage.local.set({
      [EXCLUDED_KEY]: [
        { value: 'ok', kind: 'url', time: '5' },
        { value: 'no-time', kind: 'host' }, // time absent -> Number(undefined) is NaN -> coerced to 0
        { kind: 'url' },
        { value: 'x', kind: 'nope' },
        null,
      ],
    });
    expect(await loadExcluded()).toEqual([
      { value: 'ok', kind: 'url', time: 5 },
      { value: 'no-time', kind: 'host', time: 0 },
    ]);
  });
  it('loadExcluded treats a non-array stored value as no data', async () => {
    await chrome.storage.local.set({ [EXCLUDED_KEY]: 'corrupted-not-an-array' });
    expect(await loadExcluded()).toEqual([]);
  });
  it('recovers the write chain after a rejected write, so a later write still applies', async () => {
    (chrome.storage.local.set as Mock).mockImplementationOnce(() => Promise.reject(new Error('quota exceeded')));
    await addExcluded(e('will-fail', 'url', 1));
    await addExcluded(e('after-failure', 'url', 2));
    expect((await loadExcluded()).map((x) => x.value)).toEqual(['after-failure']);
  });
});
