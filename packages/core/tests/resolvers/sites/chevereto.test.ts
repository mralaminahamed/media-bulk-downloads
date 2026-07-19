import { cheveretoImageRef, cheveretoMediaFromHtml } from '@mbd/core/resolvers/sites/chevereto';

describe('cheveretoImageRef', () => {
  it.each([
    ['jpgfish jpg7.cr /img/', 'https://jpg7.cr/img/TITLE.abc123', { id: 'TITLE.abc123', host: 'jpg7.cr' }],
    ['jpg.church /image/', 'https://jpg.church/image/foo.x1', { id: 'foo.x1', host: 'jpg.church' }],
    ['putme.ga /i/', 'https://putme.ga/i/bar', { id: 'bar', host: 'putme.ga' }],
    ['imglike.com /img/', 'https://imglike.com/img/baz', { id: 'baz', host: 'imglike.com' }],
  ])('parses a %s', (_l, url, want) => {
    expect(cheveretoImageRef(url)).toEqual(want);
  });

  it.each([
    ['a non-chevereto host', 'https://example.com/img/x'],
    ['an album page', 'https://jpg7.cr/a/TITLE.id'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_l, url) => {
    expect(cheveretoImageRef(url)).toBeNull();
  });
});

describe('cheveretoMediaFromHtml', () => {
  const ref = { id: 'TITLE.abc123', host: 'jpg7.cr' };

  it('reads a plaintext https og:image as the original', () => {
    const html = '<meta property="og:image" content="https://simp6.jpg7.cr/i/TITLE.abc123.jpg">';
    expect(cheveretoMediaFromHtml(html, ref)).toEqual([
      { url: 'https://simp6.jpg7.cr/i/TITLE.abc123.jpg', kind: 'image', ext: 'jpg', mediaKey: 'chevereto jpg7.cr TITLE.abc123' },
    ]);
  });

  it('handles the content-before-property meta order', () => {
    const html = '<meta content="https://cdn.imglike.com/x/a.png" property="og:image">';
    expect(cheveretoMediaFromHtml(html, { id: 'a', host: 'imglike.com' })[0].url).toBe('https://cdn.imglike.com/x/a.png');
  });

  it.each([
    ['an encrypted/non-url og:image', '<meta property="og:image" content="U2FsdGVkX1+encryptedblob">'],
    ['a loading.svg placeholder', '<meta property="og:image" content="https://jpg7.cr/loading.svg">'],
    ['no og:image at all', '<div>no meta</div>'],
  ])('returns [] for %s (fails closed, no decryption)', (_l, html) => {
    expect(cheveretoMediaFromHtml(html, ref)).toEqual([]);
  });
});
