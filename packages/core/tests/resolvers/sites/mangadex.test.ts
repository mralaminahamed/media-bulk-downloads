import { describe, it, expect, beforeEach } from 'vitest';
import {
  ingestSniffedMangadexMedia,
  mangadexPageMedia,
  __resetMangadexSniffed,
} from '@mbd/core/resolvers/sites/mangadex';

const CID = '0aaf8b27-0013-4ae0-8935-91a089466874';
const CID2 = '11111111-2222-4333-8444-555555555555';
const BASE = 'https://cmdxd98sb0x3yprd.mangadex.network';
const HASH = '7c07a7fecb2fe3868aa22aae2edf0e5a';

const entry = (page: number, cid = CID) => ({
  chapterId: cid,
  page,
  ext: 'png',
  url: `${BASE}/data/${HASH}/${page}-${'a'.repeat(64)}.png`,
});

beforeEach(() => __resetMangadexSniffed());

describe('mangadexPageMedia', () => {
  it('returns the sniffed chapter pages, in page order, on a /chapter/ URL', () => {
    ingestSniffedMangadexMedia([entry(2), entry(1)]);
    const out = mangadexPageMedia(`https://mangadex.org/chapter/${CID}`);
    expect(out.map((c) => c.url)).toEqual([entry(1).url, entry(2).url]);
    expect(out.every((c) => c.kind === 'image')).toBe(true);
    expect(out[0].ext).toBe('png');
  });

  it('returns only the current chapter, not another sniffed chapter', () => {
    ingestSniffedMangadexMedia([entry(1, CID), entry(1, CID2)]);
    expect(mangadexPageMedia(`https://mangadex.org/chapter/${CID}`).map((c) => c.url)).toEqual([entry(1, CID).url]);
    expect(mangadexPageMedia(`https://mangadex.org/chapter/${CID2}`).map((c) => c.url)).toEqual([entry(1, CID2).url]);
  });

  it('returns [] off a chapter page', () => {
    ingestSniffedMangadexMedia([entry(1)]);
    expect(mangadexPageMedia('https://mangadex.org/title/abc')).toEqual([]);
    expect(mangadexPageMedia(undefined)).toEqual([]);
  });

  it('dedupes a page re-sniffed on a repeat at-home fetch', () => {
    ingestSniffedMangadexMedia([entry(1), entry(2)]);
    ingestSniffedMangadexMedia([entry(1), entry(2)]);
    expect(mangadexPageMedia(`https://mangadex.org/chapter/${CID}`)).toHaveLength(2);
  });
});

describe('ingestSniffedMangadexMedia (untrusted boundary)', () => {
  it('host-pins the url and drops off-CDN entries', () => {
    ingestSniffedMangadexMedia([
      entry(1),
      { chapterId: CID, page: 2, ext: 'png', url: 'https://evil.com/data/x/2.png' },
    ]);
    const out = mangadexPageMedia(`https://mangadex.org/chapter/${CID}`);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe(entry(1).url);
  });

  it('drops entries with a malformed chapter id', () => {
    ingestSniffedMangadexMedia([{ chapterId: 'nope', page: 1, ext: 'png', url: entry(1).url }]);
    expect(mangadexPageMedia(`https://mangadex.org/chapter/${CID}`)).toEqual([]);
  });

  it('ignores a non-array payload without throwing', () => {
    expect(() => ingestSniffedMangadexMedia('boom' as unknown)).not.toThrow();
    expect(() => ingestSniffedMangadexMedia(null as unknown)).not.toThrow();
    expect(mangadexPageMedia(`https://mangadex.org/chapter/${CID}`)).toEqual([]);
  });
});
