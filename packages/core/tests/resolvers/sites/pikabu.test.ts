import { pikabuResolver } from '@mbd/core/resolvers/sites/pikabu';

const ctx = (el: Element | undefined, pageUrl: string) => ({ el, allowNetwork: false as const, pageUrl });
const PAGE = 'https://pikabu.ru/story/some_title_10203040';

describe('pikabuResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('matches on the page host, not the media host', () => {
    const u = new URL('https://cs14.pikabu.ru/post_img/2024/preview/1.jpg');
    expect(pikabuResolver.match(u, ctx(undefined, PAGE))).toBe(true);
    expect(pikabuResolver.match(u, ctx(undefined, 'https://example.com/'))).toBe(false);
    expect(pikabuResolver.match(u, { allowNetwork: false })).toBe(false); // no pageUrl
  });

  it('reads the /big/ original from the story-image link, element-scoped', () => {
    document.body.innerHTML =
      '<div class="story-image"><a class="story-image__link" href="https://cs14.pikabu.ru/post_img/big/2024/07/16/abc.png">' +
      '<img class="story-image__image" src="https://cs14.pikabu.ru/post_img/2024/07/16/abc.png"></a></div>';
    const img = document.querySelector('img') as Element;
    const [c] = pikabuResolver.resolve(
      new URL('https://cs14.pikabu.ru/post_img/2024/07/16/abc.png'), ctx(img, PAGE));
    expect(c.url).toBe('https://cs14.pikabu.ru/post_img/big/2024/07/16/abc.png');
    expect(c.kind).toBe('image');
    expect(c.ext).toBe('png');
    expect(c.thumbnailSrc).toBe('https://cs14.pikabu.ru/post_img/2024/07/16/abc.png');
  });

  it('fails closed when the link points off the pikabu CDN', () => {
    document.body.innerHTML =
      '<div class="story-image"><a class="story-image__link" href="https://evil.example.com/x.png">' +
      '<img class="story-image__image" src="https://cs14.pikabu.ru/post_img/2024/07/16/x.png"></a></div>';
    const img = document.querySelector('img') as Element;
    expect(pikabuResolver.resolve(
      new URL('https://cs14.pikabu.ru/post_img/2024/07/16/x.png'), ctx(img, PAGE))).toEqual([]);
  });

  it('returns [] when there is no story-image link (already the original)', () => {
    document.body.innerHTML =
      '<img class="story-image__image" src="https://cs14.pikabu.ru/post_img/big/2024/07/16/y.png">';
    const img = document.querySelector('img') as Element;
    expect(pikabuResolver.resolve(
      new URL('https://cs14.pikabu.ru/post_img/big/2024/07/16/y.png'), ctx(img, PAGE))).toEqual([]);
  });
});
