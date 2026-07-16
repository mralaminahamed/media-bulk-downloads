/** @vitest-environment jsdom */
import { sankakuResolver } from '@mbd/core/resolvers/sites/sankaku';
import post from '../../fixtures/sankaku/post.json';

// Real logged-in full-view sample (issue #319, AC-6). md5/host/path/param-names are
// real; token values are redacted in the fixture — the resolver keeps the URL intact
// either way, so redacted signatures exercise the same path.
const MD5 = post.md5;
const { preview, sample, original } = post.tiers;
const resolve = (href: string) => sankakuResolver.resolve(new URL(href), { allowNetwork: false });
const m = (href: string) => sankakuResolver.match(new URL(href), { allowNetwork: false });

describe('sankakuResolver — match', () => {
  it('matches original/preview/sample image tiers on v./s./cdn. hosts', () => {
    expect(m(original)).toBe(true);
    expect(m(preview)).toBe(true);
    expect(m(sample)).toBe(true);
    expect(m(`https://cdn.sankakucomplex.com/data/26/20/${MD5}.png`)).toBe(true);
  });

  it('does not match video posts, the SPA host, or analytics', () => {
    expect(m(`https://v.sankakucomplex.com/data/26/20/${MD5}.mp4?e=1`)).toBe(false);
    expect(m(`https://sankaku.app/posts/${post.postId}`)).toBe(false);
    expect(m('https://a.sankakucomplex.com/piwik.php?idsite=1')).toBe(false);
  });
});

describe('sankakuResolver — resolve', () => {
  it('emits an image candidate with md5 mediaKey, real ext, and the signed URL intact', () => {
    const [c] = resolve(original);
    expect(c).toEqual({ url: original, kind: 'image', ext: 'jpg', mediaKey: `sankaku ${MD5}` });
  });

  it('reads ext from a preview .avif and keeps the same md5 mediaKey', () => {
    const [c] = resolve(preview);
    expect(c).toMatchObject({ kind: 'image', ext: 'avif', mediaKey: `sankaku ${MD5}` });
  });
});

describe('sankakuResolver — Tier-2 resolveHint', () => {
  const withDom = (html: string, imgSrc: string) => {
    document.body.innerHTML = html;
    const img = document.querySelector('img')!;
    img.setAttribute('src', imgSrc);
    return sankakuResolver.resolve(new URL(imgSrc), { el: img, allowNetwork: false });
  };

  it('attaches a sankaku resolveHint when a preview tile links to /posts/<id>', () => {
    const [c] = withDom(`<a href="/posts/${post.postId}?tags=x"><img></a>`, preview);
    expect(c).toMatchObject({ kind: 'image', mediaKey: `sankaku ${MD5}`, resolveHint: { platform: 'sankaku', id: post.postId } });
    document.body.innerHTML = '';
  });

  it('does not attach a hint when there is no /posts/ link (Tier-1 output unchanged)', () => {
    const [c] = withDom('<div><img></div>', preview);
    expect(c.resolveHint).toBeUndefined();
    expect(c).toMatchObject({ kind: 'image', ext: 'avif', mediaKey: `sankaku ${MD5}` });
    document.body.innerHTML = '';
  });

  it('does not attach a hint on an original-tier URL (already the original)', () => {
    const [c] = withDom(`<a href="/posts/${post.postId}"><img></a>`, original);
    expect(c.resolveHint).toBeUndefined();
    document.body.innerHTML = '';
  });

  it('ignores a malformed post id', () => {
    const [c] = withDom('<a href="/posts/bad id!"><img></a>', preview);
    expect(c.resolveHint).toBeUndefined();
    document.body.innerHTML = '';
  });
});
