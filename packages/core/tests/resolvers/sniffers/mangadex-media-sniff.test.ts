import { describe, it, expect } from 'vitest';
import {
  extractMangadexMedia,
  mdMediaUrl,
  chapterIdFromAtHomeUrl,
  chapterIdFromPageUrl,
  isMangadexHost,
} from '@mbd/core/resolvers/sniffers/mangadex-media-sniff';

const CID = '0aaf8b27-0013-4ae0-8935-91a089466874';
const HASH = '7c07a7fecb2fe3868aa22aae2edf0e5a';
const BASE = 'https://cmdxd98sb0x3yprd.mangadex.network';

const atHome = (over: Record<string, unknown> = {}) => ({
  result: 'ok',
  baseUrl: BASE,
  chapter: {
    hash: HASH,
    data: [`1-${'a'.repeat(64)}.png`, `2-${'b'.repeat(64)}.png`],
    dataSaver: [`1-${'c'.repeat(64)}.jpg`, `2-${'d'.repeat(64)}.jpg`],
    ...over,
  },
});

describe('extractMangadexMedia', () => {
  it('builds full /data/ page URLs in order, keyed by chapter id', () => {
    const out = extractMangadexMedia(atHome(), CID);
    expect(out).toEqual([
      { chapterId: CID, page: 1, ext: 'png', url: `${BASE}/data/${HASH}/1-${'a'.repeat(64)}.png` },
      { chapterId: CID, page: 2, ext: 'png', url: `${BASE}/data/${HASH}/2-${'b'.repeat(64)}.png` },
    ]);
  });

  it('prefers full data over dataSaver', () => {
    const out = extractMangadexMedia(atHome(), CID);
    expect(out.every((e) => e.url.includes('/data/'))).toBe(true);
    expect(out.some((e) => e.url.includes('/data-saver/'))).toBe(false);
  });

  it('falls back to dataSaver when data is empty', () => {
    const out = extractMangadexMedia(atHome({ data: [] }), CID);
    expect(out).toHaveLength(2);
    expect(out[0].url).toBe(`${BASE}/data-saver/${HASH}/1-${'c'.repeat(64)}.jpg`);
    expect(out[0].ext).toBe('jpg');
  });

  it('rejects a non-mangadex baseUrl (SSRF pin)', () => {
    expect(extractMangadexMedia(atHome(), CID)).not.toHaveLength(0);
    expect(extractMangadexMedia({ baseUrl: 'https://evil.example.com', chapter: atHome().chapter }, CID)).toEqual([]);
  });

  it('rejects an http (non-https) baseUrl', () => {
    expect(extractMangadexMedia({ baseUrl: BASE.replace('https', 'http'), chapter: atHome().chapter }, CID)).toEqual([]);
  });

  it('rejects a bad chapter hash', () => {
    expect(extractMangadexMedia(atHome({ hash: '../etc/passwd' }), CID)).toEqual([]);
    expect(extractMangadexMedia(atHome({ hash: 'nothex!!' }), CID)).toEqual([]);
  });

  it('drops a page filename that is not a plain image name', () => {
    const out = extractMangadexMedia(atHome({ data: [`1-${'a'.repeat(64)}.png`, '../../secret.png', 'x/y.png'] }), CID);
    expect(out).toHaveLength(1);
    expect(out[0].page).toBe(1);
  });

  it('returns [] for an invalid chapter id', () => {
    expect(extractMangadexMedia(atHome(), 'not-a-uuid')).toEqual([]);
  });

  it('never throws on junk', () => {
    for (const junk of [null, undefined, 42, '', {}, { chapter: {} }, { baseUrl: BASE }]) {
      expect(() => extractMangadexMedia(junk, CID)).not.toThrow();
      expect(extractMangadexMedia(junk, CID)).toEqual([]);
    }
  });
});

describe('mdMediaUrl (host pin)', () => {
  it('accepts *.mangadex.network and uploads.mangadex.org over https', () => {
    expect(mdMediaUrl(`${BASE}/data/${HASH}/1.png`)).toBe(`${BASE}/data/${HASH}/1.png`);
    expect(mdMediaUrl('https://uploads.mangadex.org/data/x/1.png')).toBe('https://uploads.mangadex.org/data/x/1.png');
  });

  it('rejects other hosts, http, and non-strings', () => {
    expect(mdMediaUrl('https://mangadex.network.evil.com/1.png')).toBeNull();
    expect(mdMediaUrl('http://x.mangadex.network/1.png')).toBeNull();
    expect(mdMediaUrl('https://evil.com/1.png')).toBeNull();
    expect(mdMediaUrl(42)).toBeNull();
    expect(mdMediaUrl('not a url')).toBeNull();
  });
});

describe('chapter id extraction', () => {
  it('reads the id from an at-home request URL', () => {
    expect(chapterIdFromAtHomeUrl(`https://api.mangadex.org/at-home/server/${CID}?forcePort443=false`)).toBe(CID);
    expect(chapterIdFromAtHomeUrl('https://api.mangadex.org/at-home/server/nope')).toBeNull();
    expect(chapterIdFromAtHomeUrl('https://api.mangadex.org/manga')).toBeNull();
  });

  it('reads the id from a reader page URL', () => {
    expect(chapterIdFromPageUrl(`https://mangadex.org/chapter/${CID}`)).toBe(CID);
    expect(chapterIdFromPageUrl(`https://mangadex.org/chapter/${CID}/3`)).toBe(CID);
    expect(chapterIdFromPageUrl('https://mangadex.org/title/abc')).toBeNull();
  });
});

describe('isMangadexHost', () => {
  it('matches mangadex.org and subdomains only', () => {
    expect(isMangadexHost('mangadex.org')).toBe(true);
    expect(isMangadexHost('www.mangadex.org')).toBe(true);
    expect(isMangadexHost('mangadex.org.evil.com')).toBe(false);
    expect(isMangadexHost('notmangadex.org')).toBe(false);
  });
});
