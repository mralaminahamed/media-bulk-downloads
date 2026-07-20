import { foolfuukaResolver } from '@mbd/core/resolvers/sites/foolfuuka';

const ctx = (el: Element | undefined, pageUrl: string) => ({ el, allowNetwork: false as const, pageUrl });
const DESU = 'https://desuarchive.org/g/thread/100000000/';
const PLEBS = 'https://archive.4plebs.org/pol/thread/200000000/';

const post = (fullHref: string, thumb: string) =>
  `<article class="post"><div class="thread_image_box">` +
  `<a class="thread_image_link" href="${fullHref}">` +
  `<img class="post_image" data-original="${thumb}" src="${thumb}"></a></div></article>`;

describe('foolfuukaResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('matches the archive page hosts, not the media host', () => {
    const u = new URL('https://desu-usergeneratedcontent.xyz/g/thumb/1/2/123s.jpg');
    expect(foolfuukaResolver.match(u, ctx(undefined, DESU))).toBe(true);
    expect(foolfuukaResolver.match(u, ctx(undefined, PLEBS))).toBe(true);
    expect(foolfuukaResolver.match(u, ctx(undefined, 'https://boards.4chan.org/g/thread/1'))).toBe(false);
    expect(foolfuukaResolver.match(u, { allowNetwork: false })).toBe(false);
  });

  it('desuarchive: reads the thread_image_link full media (real ext), host-pinned', () => {
    const thumb = 'https://desu-usergeneratedcontent.xyz/g/thumb/1548/57/1548571234567s.jpg';
    document.body.innerHTML = post(
      '//desu-usergeneratedcontent.xyz/g/image/1548/57/1548571234567.png', thumb);
    const img = document.querySelector('img') as Element;
    const [c] = foolfuukaResolver.resolve(new URL(thumb), ctx(img, DESU));
    expect(c.url).toBe('https://desu-usergeneratedcontent.xyz/g/image/1548/57/1548571234567.png');
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('png');
    expect(c.thumbnailSrc).toBe(thumb);
    expect(c.mediaKey).toBe('foolfuuka desuarchive.org 1548571234567');
  });

  it('4plebs: pins to i.4pcdn.org and keeps a .webm as video', () => {
    const thumb = 'https://i.4pcdn.org/pol/thumb/1234/56/1234567890123s.jpg';
    document.body.innerHTML = post('https://i.4pcdn.org/pol/image/1234/56/1234567890123.webm', thumb);
    const img = document.querySelector('img') as Element;
    const [c] = foolfuukaResolver.resolve(new URL(thumb), ctx(img, PLEBS));
    expect(c.url).toBe('https://i.4pcdn.org/pol/image/1234/56/1234567890123.webm');
    expect(c.kind).toBe('video');
    expect(c.ext).toBe('webm');
  });

  it('is element-scoped: each thumb resolves its own post in a multi-post thread', () => {
    document.body.innerHTML =
      post('//desu-usergeneratedcontent.xyz/g/image/1/1/1111.png',
        'https://desu-usergeneratedcontent.xyz/g/thumb/1/1/1111s.jpg') +
      post('//desu-usergeneratedcontent.xyz/g/image/2/2/2222.gif',
        'https://desu-usergeneratedcontent.xyz/g/thumb/2/2/2222s.jpg');
    const img2 = document.querySelectorAll('img')[1] as Element;
    const [c] = foolfuukaResolver.resolve(
      new URL('https://desu-usergeneratedcontent.xyz/g/thumb/2/2/2222s.jpg'), ctx(img2, DESU));
    expect(c.url).toBe('https://desu-usergeneratedcontent.xyz/g/image/2/2/2222.gif');
    expect(c.kind).toBe('gif');
  });

  it('fails closed when the media link points off the archive CDN', () => {
    const thumb = 'https://desu-usergeneratedcontent.xyz/g/thumb/1/2/9s.jpg';
    document.body.innerHTML = post('https://evil.example.com/g/9.png', thumb);
    const img = document.querySelector('img') as Element;
    expect(foolfuukaResolver.resolve(new URL(thumb), ctx(img, DESU))).toEqual([]);
  });

  it('returns [] when the post has no media link', () => {
    document.body.innerHTML =
      '<article class="post"><img class="post_image" src="https://desu-usergeneratedcontent.xyz/g/thumb/1/2/3s.jpg"></article>';
    const img = document.querySelector('img') as Element;
    expect(foolfuukaResolver.resolve(
      new URL('https://desu-usergeneratedcontent.xyz/g/thumb/1/2/3s.jpg'), ctx(img, DESU))).toEqual([]);
  });
});
