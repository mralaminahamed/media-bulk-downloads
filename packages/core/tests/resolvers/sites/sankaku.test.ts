/** @vitest-environment jsdom */
import { sankakuResolver } from '@mbd/core/resolvers/sites/sankaku';

const MD5 = '2620d86cb72802a5dcd9e1e189b75e64';
const SIG = 'e=1784118574&expires=1784118574&m=wZc1U3W7&token=A7Ylzte';
const resolve = (href: string) => sankakuResolver.resolve(new URL(href), { allowNetwork: false });
const m = (href: string) => sankakuResolver.match(new URL(href), { allowNetwork: false });

describe('sankakuResolver — match', () => {
  it('matches original/preview/sample image tiers on v./s./cdn. hosts', () => {
    expect(m(`https://v.sankakucomplex.com/data/26/20/${MD5}.jpg?${SIG}`)).toBe(true);
    expect(m(`https://v.sankakucomplex.com/data/preview/26/20/${MD5}.avif?${SIG}`)).toBe(true);
    expect(m(`https://s.sankakucomplex.com/data/sample/26/20/${MD5}.jpg?${SIG}`)).toBe(true);
    expect(m(`https://cdn.sankakucomplex.com/data/26/20/${MD5}.png`)).toBe(true);
  });

  it('does not match video posts, the SPA host, or analytics', () => {
    expect(m(`https://v.sankakucomplex.com/data/26/20/${MD5}.mp4?${SIG}`)).toBe(false);
    expect(m('https://sankaku.app/posts/6dMp4yzQMx')).toBe(false);
    expect(m('https://a.sankakucomplex.com/piwik.php?idsite=1')).toBe(false);
  });
});

describe('sankakuResolver — resolve', () => {
  it('emits an image candidate with md5 mediaKey, real ext, and the signed URL intact', () => {
    const url = `https://v.sankakucomplex.com/data/26/20/${MD5}.jpg?${SIG}`;
    const [c] = resolve(url);
    expect(c).toEqual({ url, kind: 'image', ext: 'jpg', mediaKey: `sankaku ${MD5}` });
  });

  it('reads ext from a preview .avif and keeps the same md5 mediaKey', () => {
    const [c] = resolve(`https://v.sankakucomplex.com/data/preview/26/20/${MD5}.avif?${SIG}`);
    expect(c).toMatchObject({ kind: 'image', ext: 'avif', mediaKey: `sankaku ${MD5}` });
  });
});

describe('sankakuResolver — Tier-2 resolveHint', () => {
  const preview = `https://v.sankakucomplex.com/data/preview/26/20/${MD5}.avif?e=1&expires=1&m=a&token=b`;
  const original = `https://v.sankakucomplex.com/data/26/20/${MD5}.jpg?e=1`;

  const withDom = (html: string, imgSrc: string) => {
    document.body.innerHTML = html;
    const img = document.querySelector('img')!;
    img.setAttribute('src', imgSrc);
    return sankakuResolver.resolve(new URL(imgSrc), { el: img, allowNetwork: false });
  };

  it('attaches a sankaku resolveHint when a preview tile links to /posts/<id>', () => {
    const [c] = withDom('<a href="/posts/vkr3E7Yo8MZ?tags=x"><img></a>', preview);
    expect(c).toMatchObject({ kind: 'image', mediaKey: `sankaku ${MD5}`, resolveHint: { platform: 'sankaku', id: 'vkr3E7Yo8MZ' } });
    document.body.innerHTML = '';
  });

  it('does not attach a hint when there is no /posts/ link (Tier-1 output unchanged)', () => {
    const [c] = withDom('<div><img></div>', preview);
    expect(c.resolveHint).toBeUndefined();
    expect(c).toMatchObject({ kind: 'image', ext: 'avif', mediaKey: `sankaku ${MD5}` });
    document.body.innerHTML = '';
  });

  it('does not attach a hint on an original-tier URL (already the original)', () => {
    const [c] = withDom('<a href="/posts/vkr3E7Yo8MZ"><img></a>', original);
    expect(c.resolveHint).toBeUndefined();
    document.body.innerHTML = '';
  });

  it('ignores a malformed post id', () => {
    const [c] = withDom('<a href="/posts/bad id!"><img></a>', preview);
    expect(c.resolveHint).toBeUndefined();
    document.body.innerHTML = '';
  });
});
