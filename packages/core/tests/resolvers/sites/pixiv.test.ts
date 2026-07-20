import { pixivResolver } from '@mbd/core/resolvers/sites/pixiv';
import { ResolveContext } from '@mbd/core/resolvers/types';

const ID = '122308179';
const DATE = 'img/2024/09/10/00/00/00';
const master = (p = 0) => `https://i.pximg.net/img-master/${DATE}/${ID}_p${p}_master1200.jpg`;
const original = (p = 0, ext = 'png') => `https://i.pximg.net/img-original/${DATE}/${ID}_p${p}.${ext}`;
const feedSquare = `https://i.pximg.net/c/250x250_80_a2/img-master/${DATE}/${ID}_p0_square1200.jpg`;
const feedMasterCrop = `https://i.pximg.net/c/540x540_70/img-master/${DATE}/${ID}_p0_master1200.jpg`;

const m = (href: string) => pixivResolver.match(new URL(href), { allowNetwork: false });
const resolve = (href: string, ctx: ResolveContext = { allowNetwork: false }) =>
  pixivResolver.resolve(new URL(href), ctx);

/**
 * A real-shape Pixiv artwork-page preload blob: `illust[<id>].urls.original` names
 * the true original (here a `.png`, though the displayed master is `.jpg`). Returns
 * the collected <img> element (its ownerDocument is what the resolver reads).
 */
function artworkPage(illustId = ID, originalUrl = original(0, 'png'), pageCount = 3): Element {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  const meta = document.createElement('meta');
  meta.id = 'meta-preload-data';
  meta.setAttribute(
    'content',
    JSON.stringify({
      timestamp: '2024-09-10T00:00:00+09:00',
      illust: {
        [illustId]: {
          id: illustId,
          urls: {
            thumb: `https://i.pximg.net/c/128x128/img-master/${DATE}/${illustId}_p0_square1200.jpg`,
            regular: master(0),
            original: originalUrl,
          },
          pageCount,
        },
      },
      user: {},
    }),
  );
  document.head.appendChild(meta);
  const img = document.createElement('img');
  document.body.appendChild(img);
  return img;
}

describe('pixivResolver — match', () => {
  it('matches i.pximg.net work images (master / crop / original), not avatars or other hosts', () => {
    expect(m(master(0))).toBe(true);
    expect(m(feedSquare)).toBe(true);
    expect(m(original(0, 'png'))).toBe(true);
    expect(m('https://i.pximg.net/user-profile/img/2020/01/01/00/00/00/12345678/abcd_170.jpg')).toBe(false);
    expect(m('https://s.pximg.net/common/images/logo.png')).toBe(false);
    expect(m('https://example.com/122_p0_master1200.jpg')).toBe(false);
  });
});

describe('pixivResolver — artwork page (preload JSON)', () => {
  it('returns the exact original with its TRUE extension from preload (master .jpg -> original .png)', () => {
    const [c] = resolve(master(0), { allowNetwork: false, el: artworkPage() });
    expect(c).toMatchObject({ url: original(0, 'png'), kind: 'image', ext: 'png', thumbnailSrc: master(0) });
  });

  it('derives a later page from page 0 by swapping the _p index', () => {
    const [c] = resolve(master(2), { allowNetwork: false, el: artworkPage() });
    expect(c.url).toBe(original(2, 'png'));
    expect(c.ext).toBe('png');
  });

  it('upgrades a /c/ feed crop to the original when the preload is present', () => {
    const [c] = resolve(feedSquare, { allowNetwork: false, el: artworkPage() });
    expect(c.url).toBe(original(0, 'png'));
  });

  it('ignores a preload original that is not on the pximg host (host-pinned)', () => {
    const el = artworkPage(ID, 'https://evil.example/steal.png');
    const [c] = resolve(master(0), { allowNetwork: false, el });
    expect(c.url).toBe(master(0));
  });
});

describe('pixivResolver — no preload (feed / logged-out / no element)', () => {
  it('already-original URLs are claimed as-is with the real extension', () => {
    const [c] = resolve(original(0, 'gif'));
    expect(c).toMatchObject({ url: original(0, 'gif'), kind: 'image', ext: 'gif' });
  });

  it('strips a /c/ resize prefix off a _master1200 crop to reach the un-cropped master', () => {
    const [c] = resolve(feedMasterCrop);
    expect(c.url).toBe(master(0));
    expect(c.thumbnailSrc).toBe(feedMasterCrop);
  });

  it('leaves a _square1200 crop unchanged (no same-name un-cropped sibling to reach)', () => {
    const [c] = resolve(feedSquare);
    expect(c.url).toBe(feedSquare);
    expect(c.thumbnailSrc).toBeUndefined();
  });

  it('returns a bare master unchanged when there is no DOM context (never a 404 gamble)', () => {
    const [c] = resolve(master(0));
    expect(c).toMatchObject({ url: master(0), kind: 'image' });
    expect(c.ext).toBeUndefined();
  });
});
