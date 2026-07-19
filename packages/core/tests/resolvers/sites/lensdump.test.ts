import { lensdumpImageRef, lensdumpMediaFromHtml } from '@mbd/core/resolvers/sites/lensdump';

describe('lensdumpImageRef', () => {
  it.each([
    ['an image page', 'https://lensdump.com/i/AbC123', { id: 'AbC123', host: 'lensdump.com' }],
    ['with query', 'https://lensdump.com/i/xyz?k=1', { id: 'xyz', host: 'lensdump.com' }],
  ])('parses %s', (_l, url, want) => {
    expect(lensdumpImageRef(url)).toEqual(want);
  });

  it.each([
    ['an album page', 'https://lensdump.com/a/AbC123'],
    ['a non-lensdump host', 'https://example.com/i/AbC123'],
  ])('returns null for %s', (_l, url) => {
    expect(lensdumpImageRef(url)).toBeNull();
  });
});

describe('lensdumpMediaFromHtml', () => {
  const ref = { id: 'AbC123', host: 'lensdump.com' };

  it('reads a plaintext https og:image on the lensdump CDN', () => {
    const html = '<meta property="og:image" content="https://i.lensdump.com/i/AbC123.jpg">';
    expect(lensdumpMediaFromHtml(html, ref)).toEqual([
      { url: 'https://i.lensdump.com/i/AbC123.jpg', kind: 'image', ext: 'jpg', mediaKey: 'lensdump AbC123' },
    ]);
  });

  it('accepts the l3n.co CDN and content-before-property order', () => {
    const html = '<meta content="https://w.l3n.co/i/AbC123.png" property="og:image">';
    expect(lensdumpMediaFromHtml(html, ref)[0].url).toBe('https://w.l3n.co/i/AbC123.png');
  });

  it.each([
    ['an off-CDN og:image', '<meta property="og:image" content="https://evil.com/x.jpg">'],
    ['a non-https og:image', '<meta property="og:image" content="//i.lensdump.com/x.jpg">'],
    ['no og:image', '<div>none</div>'],
  ])('returns [] for %s (fails closed)', (_l, html) => {
    expect(lensdumpMediaFromHtml(html, ref)).toEqual([]);
  });
});
