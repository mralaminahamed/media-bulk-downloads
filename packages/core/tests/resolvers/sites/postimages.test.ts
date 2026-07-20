import { postimagesResolver } from '@mbd/core/resolvers/sites/postimages';

const ctx = (el: Element | undefined, pageUrl: string) => ({ el, allowNetwork: false as const, pageUrl });
const PAGE = 'https://postimg.cc/ppqQzvH7';

describe('postimagesResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('matches on the page host, not the media host', () => {
    const u = new URL('https://i.postimg.cc/SxpZ0Qty/image.jpg');
    expect(postimagesResolver.match(u, ctx(undefined, PAGE))).toBe(true);
    expect(postimagesResolver.match(u, ctx(undefined, 'https://postimages.org/x'))).toBe(true);
    expect(postimagesResolver.match(u, ctx(undefined, 'https://example.com/'))).toBe(false);
    expect(postimagesResolver.match(u, { allowNetwork: false })).toBe(false);
  });

  it('reads the #download original, not the downscaled display/og:image', () => {
    const dl = document.createElement('a');
    dl.id = 'download';
    dl.setAttribute('href', 'https://i.postimg.cc/9CDs7rdq/image.jpg?dl=1');
    document.body.appendChild(dl);
    const img = document.createElement('img');
    img.setAttribute('src', 'https://i.postimg.cc/SxpZ0Qty/image.jpg');
    document.body.appendChild(img);
    const [c] = postimagesResolver.resolve(new URL('https://i.postimg.cc/SxpZ0Qty/image.jpg'), ctx(img, PAGE));
    expect(c.url).toBe('https://i.postimg.cc/9CDs7rdq/image.jpg');
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('jpg');
    expect(c.thumbnailSrc).toBe('https://i.postimg.cc/SxpZ0Qty/image.jpg');
  });

  it('maps a .gif original to the gif kind', () => {
    const dl = document.createElement('a');
    dl.id = 'download';
    dl.setAttribute('href', 'https://i.postimg.cc/abcdef12/anim.gif?dl=1');
    document.body.appendChild(dl);
    const img = document.createElement('img');
    img.setAttribute('src', 'https://i.postimg.cc/zzzz/anim.gif');
    document.body.appendChild(img);
    const [c] = postimagesResolver.resolve(new URL('https://i.postimg.cc/zzzz/anim.gif'), ctx(img, PAGE));
    expect(c.url).toBe('https://i.postimg.cc/abcdef12/anim.gif');
    expect(c.kind).toBe('gif');
  });

  it('returns [] when there is no #download link', () => {
    const img = document.createElement('img');
    img.setAttribute('src', 'https://i.postimg.cc/SxpZ0Qty/image.jpg');
    document.body.appendChild(img);
    expect(postimagesResolver.resolve(new URL('https://i.postimg.cc/SxpZ0Qty/image.jpg'), ctx(img, PAGE))).toEqual([]);
  });

  it('does not pin a download href pointing off-host', () => {
    const dl = document.createElement('a');
    dl.id = 'download';
    dl.setAttribute('href', 'https://evil.example.com/x.jpg?dl=1');
    document.body.appendChild(dl);
    const img = document.createElement('img');
    img.setAttribute('src', 'https://i.postimg.cc/SxpZ0Qty/image.jpg');
    document.body.appendChild(img);
    expect(postimagesResolver.resolve(new URL('https://i.postimg.cc/SxpZ0Qty/image.jpg'), ctx(img, PAGE))).toEqual([]);
  });
});
