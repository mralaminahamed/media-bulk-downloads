import { arcxpResolver } from '@mbd/core/resolvers/sites/arcxp';
import { resolve } from '@mbd/core/resolvers';

const ctx = { allowNetwork: false };
const run = (s: string, c = ctx) => arcxpResolver.resolve(new URL(s), c);
const one = (s: string, c = ctx) => run(s, c)[0];

// An Arc XP resizer/v2 responsive srcset: same source, four widths, ONE auth
// token (the token signs the source asset, not a width).
const HOST = 'https://www.reuters.com';
const PATH = '/resizer/v2/ABC123XYZ.jpg';
const v = (w: number) => `${HOST}${PATH}?auth=SIGTOKEN&width=${w}`;
const SRCSET = [480, 720, 960, 1200].map((w) => `${v(w)} ${w}w`).join(', ');

function imgWithSrcset(currentWidth = 720, natural = { w: 1200, h: 800 }): HTMLImageElement {
  document.body.innerHTML = `<img src="${v(currentWidth)}" srcset="${SRCSET}">`;
  const img = document.querySelector('img')!;
  Object.defineProperty(img, 'naturalWidth', { value: natural.w, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: natural.h, configurable: true });
  return img;
}

describe('arcxpResolver', () => {
  it('matches only a /resizer/v2/ path that carries the page auth token', () => {
    expect(arcxpResolver.match(new URL(v(480)), ctx)).toBe(true);
    // /resizer/v2/ without an auth token is not claimed (nothing to reuse).
    expect(arcxpResolver.match(new URL(`${HOST}${PATH}?width=480`), ctx)).toBe(false);
    // a plain path on an unrelated site is not an Arc resizer.
    expect(arcxpResolver.match(new URL('https://example.com/img/photo.jpg?auth=x'), ctx)).toBe(false);
  });

  it('upgrades any width variant to the widest srcset entry', () => {
    const img = imgWithSrcset(720);
    const r = arcxpResolver.resolve(new URL(v(720)), { el: img, allowNetwork: false })[0];
    expect(r.url).toBe(v(1200));
    expect(r.ext).toBe('jpg');
  });

  it('collapses every srcset width to the SAME output URL (dedups to one item)', () => {
    const img = imgWithSrcset(480);
    const urls = [480, 720, 960, 1200].map(
      (w) => arcxpResolver.resolve(new URL(v(w)), { el: img, allowNetwork: false })[0].url,
    );
    expect(new Set(urls)).toEqual(new Set([v(1200)]));
  });

  it('reuses the page auth token verbatim (never strips or forges it)', () => {
    const img = imgWithSrcset(720);
    const r = arcxpResolver.resolve(new URL(v(720)), { el: img, allowNetwork: false })[0];
    expect(r.url).toContain('auth=SIGTOKEN');
    expect(r.url).toContain('width=1200');
  });

  it('sets a smaller variant as the thumbnail', () => {
    const img = imgWithSrcset(720);
    const r = arcxpResolver.resolve(new URL(v(720)), { el: img, allowNetwork: false })[0];
    expect(r.thumbnailSrc).toBe(v(480));
  });

  it('reports the true width and an aspect-derived height from the element', () => {
    const img = imgWithSrcset(720, { w: 1200, h: 800 });
    const r = arcxpResolver.resolve(new URL(v(720)), { el: img, allowNetwork: false })[0];
    expect(r.width).toBe(1200);
    expect(r.height).toBe(800);
  });

  it('host-pins srcset entries — ignores an off-host URL smuggled into srcset', () => {
    document.body.innerHTML =
      `<img src="${v(720)}" srcset="https://evil.example.com/resizer/v2/big.jpg?auth=x&width=5000 5000w, ${v(1200)} 1200w">`;
    const img = document.querySelector('img')!;
    const r = arcxpResolver.resolve(new URL(v(720)), { el: img, allowNetwork: false })[0];
    expect(r.url).toBe(v(1200));
    expect(r.url).not.toContain('evil.example.com');
  });

  it('returns a bare, element-less URL unchanged (no fabrication, no minted width)', () => {
    const r = one(v(600));
    expect(r.url).toBe(v(600));
    expect(r.ext).toBe('jpg');
    expect(r.thumbnailSrc).toBeUndefined();
  });

  it('routes through the registry and collapses variants end to end', () => {
    const img = imgWithSrcset(720);
    const [c] = resolve(v(480), { el: img, allowNetwork: false });
    expect(c).toMatchObject({ kind: 'image', url: v(1200), ext: 'jpg' });
  });
});
