import { resolve } from '@/extension/shared/resolvers';

const ctx = { allowNetwork: false };

describe('resolve — generic fallback', () => {
  it('upgrades a known CDN URL via the generic resolver', () => {
    const [c] = resolve('https://i.ytimg.com/vi/ID/hqdefault.jpg', ctx);
    expect(c).toMatchObject({ kind: 'image', url: 'https://i.ytimg.com/vi/ID/maxresdefault.jpg' });
    expect(c.thumbnailSrc).toBe('https://i.ytimg.com/vi/ID/hqdefault.jpg');
  });
  it('returns identity image candidate for a plain URL', () => {
    expect(resolve('https://ex.com/a.jpg', ctx)).toEqual([{ url: 'https://ex.com/a.jpg', kind: 'image' }]);
  });
  it('returns identity for a malformed URL', () => {
    // Note: '::::' from the task brief does NOT throw here — jsdom's
    // document.baseURI defaults to 'http://localhost/', and `new URL('::::', base)`
    // resolves as a valid path-relative reference (http://localhost/::::) rather
    // than throwing. 'http://' is used instead: it is genuinely unparseable even
    // with a base present, so it correctly exercises the catch/identity-fallback path.
    expect(resolve('http://', ctx)).toEqual([{ url: 'http://', kind: 'image' }]);
  });
});
