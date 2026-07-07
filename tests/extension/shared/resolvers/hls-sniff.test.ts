import { ingestSniffedHls, sniffedHlsManifests, resetSniffedHls } from '@/extension/shared/resolvers/sniffers/hls-sniff';

describe('hls-sniff store', () => {
  beforeEach(() => resetSniffedHls());

  it('stores http(s) .m3u8 URLs', () => {
    ingestSniffedHls(['https://cdn.test/a/master.m3u8', 'http://cdn.test/b/index.m3u8?t=1']);
    expect(sniffedHlsManifests()).toEqual([
      'https://cdn.test/a/master.m3u8',
      'http://cdn.test/b/index.m3u8?t=1',
    ]);
  });

  it('rejects non-manifest, non-http, and non-string entries', () => {
    ingestSniffedHls([
      'https://cdn.test/video.mp4',
      'blob:https://cdn.test/x.m3u8',
      'ftp://cdn.test/y.m3u8',
      42,
      null,
      { url: 'https://cdn.test/z.m3u8' },
    ]);
    expect(sniffedHlsManifests()).toEqual([]);
  });

  it('dedupes and refreshes recency (re-seen URL moves to newest)', () => {
    ingestSniffedHls(['https://cdn.test/1.m3u8', 'https://cdn.test/2.m3u8']);
    ingestSniffedHls(['https://cdn.test/1.m3u8']);
    expect(sniffedHlsManifests()).toEqual(['https://cdn.test/2.m3u8', 'https://cdn.test/1.m3u8']);
  });

  it('ignores a non-array payload', () => {
    ingestSniffedHls('https://cdn.test/x.m3u8' as unknown);
    ingestSniffedHls(undefined);
    expect(sniffedHlsManifests()).toEqual([]);
  });

  it('caps the store, evicting the oldest', () => {
    const urls = Array.from({ length: 520 }, (_, i) => `https://cdn.test/${i}.m3u8`);
    ingestSniffedHls(urls);
    const stored = sniffedHlsManifests();
    expect(stored).toHaveLength(500);
    expect(stored[0]).toBe('https://cdn.test/20.m3u8'); // first 20 evicted
    expect(stored[stored.length - 1]).toBe('https://cdn.test/519.m3u8');
  });

  it('stores a sniffed .mpd URL', () => {
    resetSniffedHls();
    ingestSniffedHls(['https://cdn.com/movie.mpd']);
    expect(sniffedHlsManifests()).toContain('https://cdn.com/movie.mpd');
  });
  it('still rejects a non-manifest URL', () => {
    resetSniffedHls();
    ingestSniffedHls(['https://cdn.com/not-a-manifest.txt', 'ftp://x/a.mpd']);
    expect(sniffedHlsManifests()).toEqual([]);
  });
});
