import {
  mergeExcluded, loadExcluded, addExcluded, removeExcluded, clearExcluded, restoreExcluded,
  excludedMatchers, EXCLUDED_KEY, EXCLUDED_CAP,
} from '@/extension/shared/storage/excluded';
import { ExcludedEntry } from '@/types';

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
  it('restore replaces', async () => {
    await addExcluded(e('old', 'url', 1));
    await restoreExcluded([e('new', 'host', 9)]);
    expect(await loadExcluded()).toEqual([e('new', 'host', 9)]);
  });
  it('excludedMatchers builds url + host sets', async () => {
    await addExcluded(e('https://x/a.png', 'url', 1));
    await addExcluded(e('cdn.ads.com', 'host', 2));
    const m = await excludedMatchers();
    expect(m.urls.has('https://x/a.png')).toBe(true);
    expect(m.hosts.has('cdn.ads.com')).toBe(true);
    expect(m.urls.has('cdn.ads.com')).toBe(false);
  });
  it('loadExcluded drops corrupt entries and coerces time', async () => {
    await chrome.storage.local.set({ [EXCLUDED_KEY]: [{ value: 'ok', kind: 'url', time: '5' }, { kind: 'url' }, { value: 'x', kind: 'nope' }, null] });
    expect(await loadExcluded()).toEqual([{ value: 'ok', kind: 'url', time: 5 }]);
  });
});
