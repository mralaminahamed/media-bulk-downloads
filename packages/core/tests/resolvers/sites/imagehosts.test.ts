import { imageHostMedia, isImageHost } from '@mbd/core/resolvers/sites/imagehosts';

describe('isImageHost', () => {
  it.each([
    'imgspice.com',
    'www.imgpv.com',
    'imagebam.com',
    'img5.imagevenue.com',
    'pixhost.to',
    'imagetwist.com',
    'imgdrive.net',
  ])('recognises %s', (h) => {
    expect(isImageHost(h)).toBe(true);
  });

  it.each(['example.com', 'imgur.com'])('rejects %s', (h) => {
    expect(isImageHost(h)).toBe(false);
  });
});

describe('imageHostMedia', () => {
  it('imgdrive: og:image with /small/ -> /big/', () => {
    const html = '<meta property="og:image" content="https://imgdrive.net/small/abc/x.jpg">';
    expect(imageHostMedia('https://imgdrive.net/img-abc.html', html)).toEqual([
      { url: 'https://imgdrive.net/big/abc/x.jpg', kind: 'image', ext: 'jpg', mediaKey: 'imghost imgdrive.net/img-abc.html' },
    ]);
  });

  it('imgspice: reads the #imgpreview img', () => {
    const html = '<img id="imgpreview" src="https://imgspice.com/i/x.jpg">';
    expect(imageHostMedia('https://imgspice.com/12345/name.jpg.html', html)[0].url).toBe('https://imgspice.com/i/x.jpg');
  });

  it('imagebam: reads the images*.imagebam.com img on a /view/ page', () => {
    const html = '<img src="https://images4.imagebam.com/aa/bb/cc/x.jpg" alt="x">';
    expect(imageHostMedia('https://www.imagebam.com/view/MABC', html)[0].url).toBe('https://images4.imagebam.com/aa/bb/cc/x.jpg');
  });

  it('imagevenue: skips loader.svg and reads the imgNN CDN image', () => {
    const html =
      '<img src="https://cdn.imagevenue.com/loader.svg"><img src="https://img101.imagevenue.com/aa/x.jpg">';
    expect(imageHostMedia('https://www.imagevenue.com/ME1ABCDE', html)[0].url).toBe('https://img101.imagevenue.com/aa/x.jpg');
  });

  it('pixhost: reads img.image-img on a /show/ page', () => {
    const html = '<img class="image-img" src="https://img101.pixhost.to/x/y.jpg">';
    expect(imageHostMedia('https://pixhost.to/show/101/name.jpg', html)[0].url).toBe('https://img101.pixhost.to/x/y.jpg');
  });

  it('fails closed: a gate page with no matching image, and an off-site url', () => {
    expect(imageHostMedia('https://imgspice.com/x.html', '<div>Continue to your image…</div>')).toEqual([]);
    expect(imageHostMedia('https://imgspice.com/x.html', '<img id="imgpreview" src="https://evil.com/x.jpg">')).toEqual([]);
  });

  it('returns [] for an unsupported host', () => {
    expect(imageHostMedia('https://example.com/img-x.html', '<meta property="og:image" content="https://example.com/x.jpg">')).toEqual([]);
  });
});
