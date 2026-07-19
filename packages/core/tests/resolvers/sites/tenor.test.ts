import { tenorViewId, tenorMediaFromCache } from '@mbd/core/resolvers/sites/tenor';

describe('tenorViewId', () => {
  it.each([
    ['a view url', 'https://tenor.com/view/cat-dancing-gif-12345678', '12345678'],
    ['a lang-prefixed url', 'https://tenor.com/en-GB/view/foo-99', '99'],
  ])('extracts the id from %s', (_l, url, want) => {
    expect(tenorViewId(url)).toBe(want);
  });

  it.each([
    ['a search page', 'https://tenor.com/search/cats'],
    ['a non-tenor host', 'https://example.com/view/x-1'],
  ])('returns null for %s', (_l, url) => {
    expect(tenorViewId(url)).toBeNull();
  });
});

describe('tenorMediaFromCache', () => {
  const ID = '12345678';
  const cache = (fmts: unknown) => JSON.stringify({ gifs: { byId: { [ID]: { media_formats: fmts } } } });

  it('prefers the animated gif on media.tenor.com', () => {
    const text = cache({
      gif: { url: 'https://media.tenor.com/abc/cat.gif' },
      mp4: { url: 'https://media.tenor.com/abc/cat.mp4' },
    });
    expect(tenorMediaFromCache(text, ID)).toEqual([
      { url: 'https://media.tenor.com/abc/cat.gif', kind: 'gif', ext: 'gif', mediaKey: 'tenor 12345678' },
    ]);
  });

  it('falls back to mp4 (kind video) when no gif format', () => {
    const text = cache({ mp4: { url: 'https://media1.tenor.com/abc/cat.mp4' } });
    expect(tenorMediaFromCache(text, ID)[0]).toEqual({
      url: 'https://media1.tenor.com/abc/cat.mp4',
      kind: 'video',
      ext: 'mp4',
      mediaKey: 'tenor 12345678',
    });
  });

  it('reads media_formats nested under results[0]', () => {
    const text = JSON.stringify({
      gifs: { byId: { [ID]: { results: [{ media_formats: { gif: { url: 'https://media.tenor.com/x/y.gif' } } }] } } },
    });
    expect(tenorMediaFromCache(text, ID)[0].url).toBe('https://media.tenor.com/x/y.gif');
  });

  it('drops off-CDN urls and returns [] for an id with no cached entry', () => {
    expect(tenorMediaFromCache(cache({ gif: { url: 'https://evil.com/x.gif' } }), ID)).toEqual([]);
    expect(tenorMediaFromCache(cache({ gif: { url: 'https://media.tenor.com/x.gif' } }), '999')).toEqual([]);
  });
});
