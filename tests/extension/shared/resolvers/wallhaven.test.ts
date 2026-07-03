import { wallhavenResolver } from '@/extension/shared/resolvers/wallhaven';

const u = (s: string) => new URL(s);
const THUMB = 'https://th.wallhaven.cc/small/ab/abcdef.jpg';

function imgInFigure(badge?: 'png' | 'gif') {
  const fig = document.createElement('figure');
  fig.setAttribute('data-wallpaper-id', 'abcdef');
  const img = document.createElement('img');
  img.setAttribute('data-src', THUMB);
  fig.appendChild(img);
  if (badge) { const s = document.createElement('span'); s.className = badge; fig.appendChild(s); }
  document.body.appendChild(fig);
  return img;
}

describe('wallhavenResolver', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('jpg by default (no badge)', () => {
    const el = imgInFigure();
    expect(wallhavenResolver.resolve(u(THUMB), { el, allowNetwork: false })[0].url)
      .toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.jpg');
  });
  it('png badge -> .png', () => {
    const el = imgInFigure('png');
    expect(wallhavenResolver.resolve(u(THUMB), { el, allowNetwork: false })[0].url)
      .toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png');
  });
  it('gif badge -> .gif', () => {
    const el = imgInFigure('gif');
    expect(wallhavenResolver.resolve(u(THUMB), { el, allowNetwork: false })[0].url)
      .toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.gif');
  });
  it('reads the full <img> src on a /w/ detail page', () => {
    const img = document.createElement('img');
    img.id = 'wallpaper';
    img.setAttribute('src', 'https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png');
    document.body.appendChild(img);
    expect(wallhavenResolver.resolve(u(THUMB), { el: img, allowNetwork: false })[0].url)
      .toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png');
  });
  it('bare thumb (no DOM ext) keeps the thumb + wallhaven hint (no blind jpg)', () => {
    const r = wallhavenResolver.resolve(u(THUMB), { allowNetwork: false })[0];
    expect(r.url).toBe(THUMB);
    expect(r.resolveHint).toEqual({ platform: 'wallhaven', id: 'abcdef' });
  });
});
