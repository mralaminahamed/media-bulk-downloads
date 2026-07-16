import { fourchanResolver } from '@mbd/core/resolvers/sites/fourchan';

const ctx = (el: Element | undefined, pageUrl: string) => ({ el, allowNetwork: false as const, pageUrl });
const PAGE = 'https://boards.4chan.org/g/thread/109285379';

describe('fourchanResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('matches on the board page host', () => {
    const u = new URL('https://i.4cdn.org/g/1784173748866628s.jpg');
    expect(fourchanResolver.match(u, ctx(undefined, PAGE))).toBe(true);
    expect(fourchanResolver.match(u, ctx(undefined, 'https://boards.4channel.org/a/thread/1'))).toBe(true);
    expect(fourchanResolver.match(u, ctx(undefined, 'https://example.com/'))).toBe(false);
    expect(fourchanResolver.match(u, { allowNetwork: false })).toBe(false); // no pageUrl
  });

  it('png post: keeps the real .png ext (the thumbnail is a forced .jpg)', () => {
    // The thumb is <tim>s.jpg; the full file's real ext lives only in the href.
    document.body.innerHTML =
      '<div class="file"><a class="fileThumb" href="//i.4cdn.org/g/1784173748866628.png">' +
      '<img src="https://i.4cdn.org/g/1784173748866628s.jpg"></a></div>';
    const img = document.querySelector('img') as Element;
    const [c] = fourchanResolver.resolve(new URL('https://i.4cdn.org/g/1784173748866628s.jpg'), ctx(img, PAGE));
    expect(c.url).toBe('https://i.4cdn.org/g/1784173748866628.png');
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('png');
    expect(c.thumbnailSrc).toBe('https://i.4cdn.org/g/1784173748866628s.jpg');
    expect(c.mediaKey).toBe('4chan 1784173748866628');
  });

  it('is element-scoped: a thumb resolves ITS OWN post file in a multi-post thread', () => {
    document.body.innerHTML =
      '<div class="postContainer" id="pc1"><div class="file">' +
      '<a class="fileThumb" href="//i.4cdn.org/g/1111.png"><img src="https://i.4cdn.org/g/1111s.jpg"></a></div></div>' +
      '<div class="postContainer" id="pc2"><div class="file">' +
      '<a class="fileThumb" href="//i.4cdn.org/g/2222.webm"><img src="https://i.4cdn.org/g/2222s.jpg"></a></div></div>';
    const img2 = document.querySelector('#pc2 img') as Element;
    const [c] = fourchanResolver.resolve(new URL('https://i.4cdn.org/g/2222s.jpg'), ctx(img2, PAGE));
    expect(c.url).toBe('https://i.4cdn.org/g/2222.webm'); // pc2's file, not pc1's
    expect(c.kind).toBe('video');
    expect(c.ext).toBe('webm');
  });

  it('falls back to the .fileText anchor when fileThumb is absent', () => {
    document.body.innerHTML =
      '<div class="postContainer"><div class="fileText"><a href="//i.4cdn.org/g/3333.gif">orig.gif</a></div>' +
      '<img src="https://i.4cdn.org/g/3333s.jpg"></div>';
    const img = document.querySelector('img') as Element;
    const [c] = fourchanResolver.resolve(new URL('https://i.4cdn.org/g/3333s.jpg'), ctx(img, PAGE));
    expect(c.url).toBe('https://i.4cdn.org/g/3333.gif');
    expect(c.kind).toBe('gif');
  });

  it('does not pin a file link pointing off the 4cdn host', () => {
    document.body.innerHTML =
      '<div class="file"><a class="fileThumb" href="//evil.example.com/g/9.png">' +
      '<img src="https://i.4cdn.org/g/9s.jpg"></a></div>';
    const img = document.querySelector('img') as Element;
    expect(fourchanResolver.resolve(new URL('https://i.4cdn.org/g/9s.jpg'), ctx(img, PAGE))).toEqual([]);
  });

  it('returns [] when the post has no file link', () => {
    document.body.innerHTML = '<div class="postContainer"><img src="https://i.4cdn.org/g/x.jpg"></div>';
    const img = document.querySelector('img') as Element;
    expect(fourchanResolver.resolve(new URL('https://i.4cdn.org/g/x.jpg'), ctx(img, PAGE))).toEqual([]);
  });
});
