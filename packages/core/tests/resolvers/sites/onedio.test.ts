import { onedioResolver } from '@mbd/core/resolvers/sites/onedio';

const ID = '6a5798a6104117297cb4e914';
const sig = (w: number) => w.toString(16).padEnd(40, '0');
const img = (w: number, h: number, opts: { id?: string; ext?: string } = {}) => {
  const { id = ID, ext = 'jpg' } = opts;
  return `https://img-s2.onedio.com/id-${id}/rev-0/w-${w}/h-${h}/f-${ext}/s-${sig(w)}.${ext}`;
};
const run = (href: string, el?: Element) =>
  onedioResolver.resolve(new URL(href), { el, allowNetwork: false });
const m = (href: string) => onedioResolver.match(new URL(href), { allowNetwork: false });

const imgEl = (src: string, srcset?: string): HTMLImageElement => {
  const i = document.createElement('img');
  i.setAttribute('src', src);
  if (srcset) i.setAttribute('srcset', srcset);
  return i;
};

describe('onedioResolver — match', () => {
  it('matches an Onedio rendition across img-s1/2/3, not other hosts or non-image paths', () => {
    expect(m(img(1200, 900))).toBe(true);
    expect(m('https://img-s1.onedio.com/id-abc/rev-0/w-50/f-jpg/s-deadbeef.jpg')).toBe(true);
    expect(m('https://img-s3.onedio.com/id-abc/rev-2/w-600/h-400/f-webp/s-deadbeef.webp')).toBe(true);
    expect(m('https://onedio.com/svg/onedio.svg')).toBe(false);
    expect(m('https://img-s2.onedio.com/some/other/path.jpg')).toBe(false);
    expect(m('https://cdn.example.com/id-abc/rev-0/w-600/h-400/f-jpg/s-x.jpg')).toBe(false);
  });
});

describe('onedioResolver — resolve', () => {
  it('with no element, tags the input width/height + <id> mediaKey, url unchanged', () => {
    const [c] = run(img(600, 450));
    expect(c).toEqual({
      url: img(600, 450),
      kind: 'image',
      ext: 'jpg',
      width: 600,
      height: 450,
      mediaKey: `onedio ${ID}`,
    });
    expect(c.thumbnailSrc).toBeUndefined();
  });

  it('elevates a small displayed src to the widest srcset rendition of the same photo', () => {
    const srcset = `${img(300, 225)} 300w, ${img(600, 450)} 600w, ${img(900, 675)} 900w, ${img(1200, 900)} 1200w`;
    const el = imgEl(img(600, 450), srcset);
    const [c] = run(img(600, 450), el);
    expect(c).toEqual({
      url: img(1200, 900),
      kind: 'image',
      ext: 'jpg',
      width: 1200,
      height: 900,
      mediaKey: `onedio ${ID}`,
      thumbnailSrc: img(600, 450),
    });
  });

  it('every width variant converges on the same widest URL (so first-seen dedup keeps the largest)', () => {
    const srcset = `${img(300, 225)} 300w, ${img(600, 450)} 600w, ${img(900, 675)} 900w, ${img(1200, 900)} 1200w`;
    const el = imgEl(img(300, 225), srcset);
    for (const [w, h] of [[300, 225], [600, 450], [900, 675], [1200, 900]]) {
      expect(run(img(w, h), el)[0].url).toBe(img(1200, 900));
    }
  });

  it('scans sibling <source>s of a <picture> for the global max of the same photo', () => {
    const source = document.createElement('source');
    source.setAttribute('srcset', `${img(300, 225)} 300w, ${img(1200, 900)} 1200w`);
    const image = imgEl(img(600, 450));
    const picture = document.createElement('picture');
    picture.appendChild(source);
    picture.appendChild(image);
    const [c] = run(img(600, 450), image);
    expect(c.url).toBe(img(1200, 900));
    expect(c.width).toBe(1200);
  });

  it('never downgrades: an already-widest input stays put with no thumbnail', () => {
    const srcset = `${img(600, 450)} 600w, ${img(1200, 900)} 1200w`;
    const el = imgEl(img(1200, 900), srcset);
    const [c] = run(img(1200, 900), el);
    expect(c.url).toBe(img(1200, 900));
    expect(c.thumbnailSrc).toBeUndefined();
  });

  it('ignores a larger rendition of a DIFFERENT photo in the srcset', () => {
    const other = img(3000, 2000, { id: 'ffffffffffffffffffffffff' });
    const el = imgEl(img(300, 225), `${other} 3000w, ${img(600, 450)} 600w`);
    const [c] = run(img(300, 225), el);
    expect(c.url).toBe(img(600, 450));
    expect(c.width).toBe(600);
  });

  it('handles a width-only rendition (no h- segment) and derives ext from f-webp path', () => {
    const [c] = run('https://img-s1.onedio.com/id-abc123/rev-0/w-50/f-webp/s-deadbeef.webp');
    expect(c).toEqual({
      url: 'https://img-s1.onedio.com/id-abc123/rev-0/w-50/f-webp/s-deadbeef.webp',
      kind: 'image',
      ext: 'webp',
      width: 50,
      mediaKey: 'onedio abc123',
    });
    expect(c.height).toBeUndefined();
  });
});
