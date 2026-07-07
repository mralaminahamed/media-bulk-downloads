import { wallhavenResolver } from '@/extension/shared/resolvers/sites/wallhaven';

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
  it('bare thumb (no DOM ext) upgrades to the /orig jpg + wallhaven hint (no blind full-file url)', () => {
    const r = wallhavenResolver.resolve(u(THUMB), { allowNetwork: false })[0];
    // largest guaranteed-existing jpg, not a w.wallhaven.cc full URL that could 404 for a png
    expect(r.url).toBe('https://th.wallhaven.cc/orig/ab/abcdef.jpg');
    expect(r.resolveHint).toEqual({ platform: 'wallhaven', id: 'abcdef' });
  });

  it('upgrades a /small grid thumbnail to /lg for a sharper preview', () => {
    const el = imgInFigure('png');
    const [c] = wallhavenResolver.resolve(u(THUMB), { el, allowNetwork: false });
    expect(c.url).toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png');
    expect(c.thumbnailSrc).toBe('https://th.wallhaven.cc/lg/ab/abcdef.jpg');
  });

  it('never downgrades a thumbnail the page already served at /orig', () => {
    const ORIG = 'https://th.wallhaven.cc/orig/ab/abcdef.jpg';
    const fig = document.createElement('figure');
    fig.setAttribute('data-wallpaper-id', 'abcdef');
    const img = document.createElement('img');
    img.setAttribute('data-src', ORIG);
    fig.appendChild(img);
    document.body.appendChild(fig);
    const [c] = wallhavenResolver.resolve(u(ORIG), { el: img, allowNetwork: false });
    expect(c.url).toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.jpg');
    expect(c.thumbnailSrc).toBe(ORIG); // kept, not downgraded to /lg
  });

  it('reads the id from the figure preview link when data-wallpaper-id is absent', () => {
    const fig = document.createElement('figure');
    fig.className = 'thumb';
    const img = document.createElement('img');
    img.setAttribute('data-src', THUMB);
    const a = document.createElement('a');
    a.className = 'preview';
    a.setAttribute('href', '/w/abcdef');
    fig.append(img, a);
    document.body.appendChild(fig);
    const [c] = wallhavenResolver.resolve(u(THUMB), { el: img, allowNetwork: false });
    expect(c.url).toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.jpg');
  });
});

function gridImg(id: string, res: string | null, badge?: 'png' | 'gif'): HTMLImageElement {
  document.body.innerHTML = '';
  const fig = document.createElement('figure');
  fig.className = 'thumb';
  fig.setAttribute('data-wallpaper-id', id);
  const img = document.createElement('img');
  img.setAttribute('src', `https://th.wallhaven.cc/small/${id.slice(0, 2)}/${id}.jpg`);
  fig.appendChild(img);
  const info = document.createElement('div');
  info.className = 'thumb-info';
  if (res !== null) {
    const wr = document.createElement('span');
    wr.className = 'wall-res';
    wr.textContent = res;
    info.appendChild(wr);
  }
  if (badge) {
    const b = document.createElement('span');
    b.className = badge;
    info.appendChild(b);
  }
  fig.appendChild(info);
  document.body.appendChild(fig);
  return img;
}
const runFor = (img: HTMLImageElement) =>
  wallhavenResolver.resolve(new URL(img.getAttribute('src')!), { el: img, allowNetwork: false });

describe('wallhaven true resolution', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('reads the grid resolution onto the upgraded candidate (png badge)', () => {
    const [c] = runFor(gridImg('po7y9j', '1920 x 1200', 'png'));
    expect(c).toMatchObject({
      url: 'https://w.wallhaven.cc/full/po/wallhaven-po7y9j.png',
      ext: 'png', width: 1920, height: 1200,
    });
  });

  it('reads resolution even with no badge (ext defaults to jpg)', () => {
    const [c] = runFor(gridImg('ab12cd', '3840 x 2160'));
    expect(c).toMatchObject({
      url: 'https://w.wallhaven.cc/full/ab/wallhaven-ab12cd.jpg',
      ext: 'jpg', width: 3840, height: 2160,
    });
  });

  it('accepts the unicode × separator', () => {
    const [c] = runFor(gridImg('uni123', '2560 × 1440', 'png'));
    expect(c).toMatchObject({ width: 2560, height: 1440 });
  });

  it('omits dims when the figure has no .wall-res', () => {
    const [c] = runFor(gridImg('nores1', null, 'png'));
    expect(c.width).toBeUndefined();
    expect(c.height).toBeUndefined();
  });

  it('omits dims for an implausible resolution label', () => {
    const [c] = runFor(gridImg('bad123', 'not a size', 'png'));
    expect(c.width).toBeUndefined();
    expect(c.height).toBeUndefined();
  });

  it('a bare thumb with no figure yields the hint candidate and no dims', () => {
    document.body.innerHTML = '';
    const img = document.createElement('img');
    img.setAttribute('src', 'https://th.wallhaven.cc/small/zz/zz9999.jpg');
    // not appended to any <figure>
    const [c] = wallhavenResolver.resolve(new URL(img.getAttribute('src')!), { el: img, allowNetwork: false });
    expect(c).toMatchObject({ resolveHint: { platform: 'wallhaven', id: 'zz9999' } });
    expect(c.width).toBeUndefined();
    expect(c.height).toBeUndefined();
  });
});
