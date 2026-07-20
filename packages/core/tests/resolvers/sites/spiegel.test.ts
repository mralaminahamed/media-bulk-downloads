import { spiegelResolver } from '@mbd/core/resolvers/sites/spiegel';

const UUID = '618070ab-cb68-4d42-b3be-168eb4712f75';
const img = (w: number, r: string, ext = 'webp') =>
  `https://cdn.prod.www.spiegel.de/images/${UUID}_w${w}_r${r}_fpx64.12_fpy50.${ext}`;
const run = (href: string, el?: Element) =>
  spiegelResolver.resolve(new URL(href), { el, allowNetwork: false });
const m = (href: string) => spiegelResolver.match(new URL(href), { allowNetwork: false });

const imgEl = (src: string, srcset?: string): HTMLImageElement => {
  const i = document.createElement('img');
  i.setAttribute('src', src);
  if (srcset) i.setAttribute('srcset', srcset);
  return i;
};

describe('spiegelResolver — match', () => {
  it('matches a Der Spiegel image rendition, not other hosts or non-image paths', () => {
    expect(m(img(1920, '1.5'))).toBe(true);
    expect(m('https://cdn.example.com/x.jpg')).toBe(false);
    expect(m('https://cdn.prod.www.spiegel.de/some/asset.jpg')).toBe(false);
  });
});

describe('spiegelResolver — resolve', () => {
  it('with no element, tags the input width/height + <uuid> mediaKey, url unchanged', () => {
    const [c] = run(img(1920, '1.5'));
    expect(c).toEqual({
      url: img(1920, '1.5'),
      kind: 'image',
      ext: 'webp',
      width: 1920,
      height: 1280, // 1920 / 1.5
      mediaKey: `spiegel ${UUID}`,
    });
    expect(c.thumbnailSrc).toBeUndefined();
  });

  it('elevates a small displayed src to the widest srcset rendition of the same photo', () => {
    const el = imgEl(img(488, '1.5'), `${img(960, '1.5')} 960w, ${img(1920, '1.5')} 1920w`);
    const [c] = run(img(488, '1.5'), el);
    expect(c).toEqual({
      url: img(1920, '1.5'),
      kind: 'image',
      ext: 'webp',
      width: 1920,
      height: 1280,
      mediaKey: `spiegel ${UUID}`,
      thumbnailSrc: img(488, '1.5'), // the small displayed rendition
    });
  });

  it('every width variant converges on the same widest URL (so first-seen dedup keeps the largest)', () => {
    const srcset = `${img(960, '1.5')} 960w, ${img(1920, '1.5')} 1920w`;
    const el = imgEl(img(488, '1.5'), srcset);
    for (const w of [488, 960, 1920]) {
      expect(run(img(w, '1.5'), el)[0].url).toBe(img(1920, '1.5'));
    }
  });

  it('scans sibling <source>s of a <picture> for the global max across crops', () => {
    const source = document.createElement('source');
    source.setAttribute('srcset', `${img(520, '1.33')} 520w, ${img(1040, '1.33')} 1040w`);
    const image = imgEl(img(488, '1.5'), `${img(960, '1.5')} 960w, ${img(1920, '1.5')} 1920w`);
    const picture = document.createElement('picture');
    picture.appendChild(source);
    picture.appendChild(image);
    const [c] = run(img(1040, '1.33'), image);
    expect(c.url).toBe(img(1920, '1.5'));
    expect(c.width).toBe(1920);
  });

  it('never downgrades: an already-widest input stays put with no thumbnail', () => {
    const el = imgEl(img(1920, '1.5'), `${img(960, '1.5')} 960w, ${img(1920, '1.5')} 1920w`);
    const [c] = run(img(1920, '1.5'), el);
    expect(c.url).toBe(img(1920, '1.5'));
    expect(c.thumbnailSrc).toBeUndefined();
  });

  it('ignores a larger rendition of a DIFFERENT photo in the srcset', () => {
    const other = 'https://cdn.prod.www.spiegel.de/images/8891568e-f25f-4650-87b4-eab52a8f0c3e_w3000_r1.5_fpx50_fpy50.webp';
    const el = imgEl(img(488, '1.5'), `${other} 3000w, ${img(960, '1.5')} 960w`);
    const [c] = run(img(488, '1.5'), el);
    expect(c.url).toBe(img(960, '1.5'));
    expect(c.width).toBe(960);
  });

  it('derives ext from the path and rounds height from a non-integer ratio', () => {
    const [c] = run(img(520, '1.33', 'jpg'));
    expect(c).toMatchObject({ kind: 'image', ext: 'jpg', width: 520, height: 391 });
  });
});
