import { magnificResolver } from '@mbd/core/resolvers/sites/magnific';
import { resolve } from '@mbd/core/resolvers';

const ctx = { allowNetwork: false };
const run = (s: string, c = ctx) => magnificResolver.resolve(new URL(s), c);
const one = (s: string, c = ctx) => run(s, c)[0];

// A magnific responsive srcset: same photo, five widths, each its own token.
const PATH = '/free-photo/nurse_1098-511.jpg';
const v = (w: number) => `https://img.magnific.com${PATH}?t=TOK${w}&w=${w}`;
const SRCSET = [360, 740, 1060, 1480, 2000].map((w) => `${v(w)} ${w}w`).join(', ');

function imgWithSrcset(currentWidth = 1060, natural = { w: 2000, h: 1350 }): HTMLImageElement {
  document.body.innerHTML = `<img src="${v(currentWidth)}" srcset="${SRCSET}">`;
  const img = document.querySelector('img')!;
  // jsdom has no loader; fake the natural dimensions the resolver reads.
  Object.defineProperty(img, 'naturalWidth', { value: natural.w, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: natural.h, configurable: true });
  return img;
}

describe('magnificResolver', () => {
  it('matches only the img.magnific.com CDN host', () => {
    expect(magnificResolver.match(new URL(v(360)), ctx)).toBe(true);
    expect(magnificResolver.match(new URL('https://www.magnific.com/free-photo/x.htm'), ctx)).toBe(false);
    expect(magnificResolver.match(new URL('https://img.example.com/a.jpg'), ctx)).toBe(false);
  });

  it('upgrades any width variant to the widest srcset entry (with its own token)', () => {
    const img = imgWithSrcset(1060);
    // Whichever width the browser loaded, the resolver returns the 2000w URL.
    const r = magnificResolver.resolve(new URL(v(1060)), { el: img, allowNetwork: false })[0];
    expect(r.url).toBe(v(2000));
    expect(r.ext).toBe('jpg');
  });

  it('collapses every srcset width to the SAME output URL (dedups to one item)', () => {
    const img = imgWithSrcset(360);
    const urls = [360, 740, 1060, 1480, 2000].map(
      (w) => magnificResolver.resolve(new URL(v(w)), { el: img, allowNetwork: false })[0].url,
    );
    expect(new Set(urls)).toEqual(new Set([v(2000)]));
  });

  it('never strips the signature token (would downgrade to the 626px default)', () => {
    const img = imgWithSrcset(1060);
    const r = magnificResolver.resolve(new URL(v(1060)), { el: img, allowNetwork: false })[0];
    expect(r.url).toContain('t=TOK2000');
    expect(r.url).toContain('w=2000');
  });

  it('sets a smaller variant as the thumbnail', () => {
    const img = imgWithSrcset(1060);
    const r = magnificResolver.resolve(new URL(v(1060)), { el: img, allowNetwork: false })[0];
    expect(r.thumbnailSrc).toBe(v(360));
  });

  it('reports the true width and an aspect-derived height from the element', () => {
    const img = imgWithSrcset(1060, { w: 2000, h: 1350 });
    const r = magnificResolver.resolve(new URL(v(1060)), { el: img, allowNetwork: false })[0];
    expect(r.width).toBe(2000);
    expect(r.height).toBe(1350);
  });

  it('host-pins srcset entries — ignores an off-host URL smuggled into srcset', () => {
    document.body.innerHTML =
      `<img src="${v(740)}" srcset="https://evil.example.com/big.jpg 5000w, ${v(2000)} 2000w">`;
    const img = document.querySelector('img')!;
    const r = magnificResolver.resolve(new URL(v(740)), { el: img, allowNetwork: false })[0];
    expect(r.url).toBe(v(2000));
    expect(r.url).not.toContain('evil.example.com');
  });

  it('derives width from the ?w= param for a density (x) srcset descriptor', () => {
    // A density-only srcset carries no pixel width descriptor, so width must come
    // from each candidate's own `?w=` param.
    document.body.innerHTML = `<img src="${v(1480)}" srcset="${v(1060)} 1x, ${v(2000)} 2x">`;
    const img = document.querySelector('img')!;
    const r = magnificResolver.resolve(new URL(v(1480)), { el: img, allowNetwork: false })[0];
    expect(r.url).toBe(v(2000));
    expect(r.width).toBe(2000);
  });

  it('skips a malformed srcset entry (URL constructor throws) and keeps the valid widest', () => {
    // A crafted srcset entry that isn't a parseable URL must be swallowed (continue),
    // never crash the resolver — the valid CDN entry still wins.
    document.body.innerHTML = `<img src="${v(740)}" srcset="not-a-valid-url 5000w, ${v(2000)} 2000w">`;
    const img = document.querySelector('img')!;
    const r = magnificResolver.resolve(new URL(v(740)), { el: img, allowNetwork: false })[0];
    expect(r.url).toBe(v(2000));
  });

  it('returns a bare, element-less URL unchanged (no fabrication, no downgrade)', () => {
    const r = one('https://img.magnific.com/free-photo/nurse_1098-511.jpg');
    expect(r.url).toBe('https://img.magnific.com/free-photo/nurse_1098-511.jpg');
    expect(r.ext).toBe('jpg');
    expect(r.thumbnailSrc).toBeUndefined();
    expect(r.width).toBeUndefined();
  });

  it('keeps a non-jpg extension from the path (e.g. png)', () => {
    expect(one('https://img.magnific.com/free-photo/logo_1-1.png?t=X&w=800').ext).toBe('png');
  });

  it('routes through the registry and collapses variants end to end', () => {
    const img = imgWithSrcset(1060);
    const [c] = resolve(v(360), { el: img, allowNetwork: false });
    expect(c).toMatchObject({ kind: 'image', url: v(2000), ext: 'jpg' });
  });
});
