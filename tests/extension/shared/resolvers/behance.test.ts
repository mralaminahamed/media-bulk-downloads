import { behanceResolver } from '@/extension/shared/resolvers/sites/behance';

const run = (href: string, el?: Element) =>
  behanceResolver.resolve(new URL(href), { el, allowNetwork: false });

describe('behanceResolver', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('project page: /project_modules/1400/ -> /project_modules/source/', () => {
    expect(run('https://mir-s3-cdn-cf.behance.net/project_modules/1400/abc123.jpg')[0].url)
      .toBe('https://mir-s3-cdn-cf.behance.net/project_modules/source/abc123.jpg');
  });
  it('search grid: strips the base64 crop token', () => {
    expect(run('https://mir-s3-cdn-cf.behance.net/projects/404/c1570e247864509.Y3JvcCwxOTE3LDE1MDAsMTY2LDA.jpg')[0].url)
      .toBe('https://mir-s3-cdn-cf.behance.net/projects/404/c1570e247864509.jpg');
  });
  it('prefers a source/fs URL already in the element srcset', () => {
    const img = document.createElement('img');
    img.setAttribute('srcset', 'https://mir-s3-cdn-cf.behance.net/project_modules/source/abc123.jpg 1x');
    expect(run('https://mir-s3-cdn-cf.behance.net/project_modules/1400/abc123.jpg', img)[0].url)
      .toContain('/project_modules/source/');
  });
  it('returns [] when there is nothing to upgrade', () => {
    expect(run('https://mir-s3-cdn-cf.behance.net/project_modules/source/abc123.jpg')).toEqual([]);
  });
  it('does not match a non-behance host', () => {
    expect(behanceResolver.match(new URL('https://example.com/x.jpg'), { allowNetwork: false })).toBe(false);
  });
  it('sets thumbnailSrc to the input', () => {
    const [c] = run('https://mir-s3-cdn-cf.behance.net/project_modules/disp/abc123.jpg');
    expect(c.thumbnailSrc).toBe('https://mir-s3-cdn-cf.behance.net/project_modules/disp/abc123.jpg');
  });
  it('reports the real file extension from the upgraded URL', () => {
    expect(run('https://mir-s3-cdn-cf.behance.net/project_modules/disp/abc123.png')[0].ext).toBe('png');
  });
  it('falls back to the path upgrade when the element carries no source/fs URL', () => {
    // el is present but its src/srcset hold only the same non-source thumbnail, so
    // domSourceFrom finds no max-size URL (its `?? null`) and the path rewrite wins.
    const img = document.createElement('img');
    img.setAttribute('src', 'https://mir-s3-cdn-cf.behance.net/project_modules/1400/abc123.jpg');
    expect(run('https://mir-s3-cdn-cf.behance.net/project_modules/1400/abc123.jpg', img)[0].url)
      .toBe('https://mir-s3-cdn-cf.behance.net/project_modules/source/abc123.jpg');
  });
  it('omits ext when the upgraded URL has no recognizable image extension', () => {
    // An extension-less CDN path still upgrades (1400 -> source) but imageExtFromUrl
    // returns null, so the candidate carries no ext (never a fabricated one).
    const [c] = run('https://mir-s3-cdn-cf.behance.net/project_modules/1400/abc123');
    expect(c.url).toBe('https://mir-s3-cdn-cf.behance.net/project_modules/source/abc123');
    expect(c.ext).toBeUndefined();
  });
});
