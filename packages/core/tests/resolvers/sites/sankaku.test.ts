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
    expect(c).toEqual({ url, kind: 'image', ext: 'jpg', mediaKey: MD5 });
  });

  it('reads ext from a preview .avif and keeps the same md5 mediaKey', () => {
    const [c] = resolve(`https://v.sankakucomplex.com/data/preview/26/20/${MD5}.avif?${SIG}`);
    expect(c).toMatchObject({ kind: 'image', ext: 'avif', mediaKey: MD5 });
  });
});
