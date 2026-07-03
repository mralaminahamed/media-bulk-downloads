import {
  deproxy,
  detectType,
  looksLikeMediaUrl,
  parseUrlDimensions,
  upgradeToOriginal,
} from '@/extension/shared/imageUrl';

describe('detectType', () => {
  it('reads a plain extension', () => {
    expect(detectType('https://x.com/a/photo.PNG')).toBe('png');
    expect(detectType('https://x.com/a/photo.jpg?v=2')).toBe('jpeg');
  });

  it('falls back to the format/fm query param when no extension', () => {
    expect(detectType('https://pbs.twimg.com/media/ABC?format=jpg&name=360x360')).toBe('jpeg');
    expect(detectType('https://cdn.test/img?fm=webp')).toBe('webp');
  });

  it('returns unknown when neither is present', () => {
    expect(detectType('https://cdn.test/img?x=1')).toBe('unknown');
  });
});

describe('parseUrlDimensions', () => {
  it('parses a name=WxH token (Twitter)', () => {
    expect(parseUrlDimensions('https://pbs.twimg.com/media/ABC?format=jpg&name=360x480')).toEqual({
      width: 360,
      height: 480,
    });
  });

  it('parses a bare WxH size token (Shopify _800x600, generic)', () => {
    expect(parseUrlDimensions('https://cdn.shopify.com/s/files/x_800x600.jpg')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('parses w/h query params, defaulting the missing axis to 0', () => {
    expect(parseUrlDimensions('https://img.test/a?w=1200')).toEqual({ width: 1200, height: 0 });
    expect(parseUrlDimensions('https://img.test/a?w=1200&h=800')).toEqual({ width: 1200, height: 800 });
  });

  it('returns null for named sizes and size-free urls', () => {
    expect(parseUrlDimensions('https://pbs.twimg.com/media/ABC?name=orig')).toBeNull();
    expect(parseUrlDimensions('https://img.test/photo.jpg')).toBeNull();
  });
});

describe('upgradeToOriginal', () => {
  const cases: Array<[string, string, string]> = [
    [
      'twitter name -> orig',
      'https://pbs.twimg.com/media/ABC?format=jpg&name=360x360',
      'https://pbs.twimg.com/media/ABC?format=jpg&name=orig',
    ],
    [
      'wordpress strips resize params + -scaled',
      'https://i0.wp.com/site.com/wp-content/a-scaled.jpg?w=600&h=400&fit=crop',
      'https://i0.wp.com/site.com/wp-content/a.jpg',
    ],
    [
      'shopify strips _WxH suffix',
      'https://cdn.shopify.com/s/files/1/x/y_800x600.jpg?v=1',
      'https://cdn.shopify.com/s/files/1/x/y.jpg?v=1',
    ],
    [
      'unsplash drops resize params',
      'https://images.unsplash.com/photo-123?w=400&q=80&fit=crop',
      'https://images.unsplash.com/photo-123',
    ],
    [
      'imgix drops resize params',
      'https://acme.imgix.net/a.jpg?w=200&h=200&fit=crop',
      'https://acme.imgix.net/a.jpg',
    ],
    [
      'wikimedia drops /thumb/ and size segment',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat.jpg/320px-Cat.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg',
    ],
  ];

  it.each(cases)('%s', (_name, input, expected) => {
    const { original, thumbnail } = upgradeToOriginal(input);
    expect(original).toBe(expected);
    expect(thumbnail).toBe(input);
  });

  it('cloudinary removes the transform segment', () => {
    const { original } = upgradeToOriginal(
      'https://res.cloudinary.com/demo/image/upload/w_300,h_200,c_fill/sample.jpg',
    );
    expect(original).toBe('https://res.cloudinary.com/demo/image/upload/sample.jpg');
  });

  it('passes through an unknown host with no thumbnail', () => {
    const r = upgradeToOriginal('https://example.com/pics/photo.jpg');
    expect(r).toEqual({ original: 'https://example.com/pics/photo.jpg' });
  });

  it('passes through a malformed url unchanged', () => {
    expect(upgradeToOriginal('not a url')).toEqual({ original: 'not a url' });
  });

  it('does not strip a shopify filename that merely ends in _x', () => {
    const r = upgradeToOriginal('https://cdn.shopify.com/s/files/1/x/vertex_x.png?v=1');
    expect(r.original).toBe('https://cdn.shopify.com/s/files/1/x/vertex_x.png?v=1');
    expect(r.thumbnail).toBeUndefined();
  });

  it('preserves the signature param on a signed imgix url', () => {
    const r = upgradeToOriginal('https://acme.imgix.net/a.jpg?w=200&s=abc123');
    expect(new URL(r.original).searchParams.get('s')).toBe('abc123');
  });

  it('discards a wikimedia rewrite that would empty the path', () => {
    // Real wikimedia thumb URLs always have a directory path ahead of `/thumb/`
    // (e.g. /wikipedia/commons/thumb/a/ab/Cat.jpg/320px-Cat.jpg), so the rewrite
    // normally leaves a filename behind. This URL is a synthetic edge case —
    // `/thumb/` sits directly at the root with no directory segments — so
    // stripping `/thumb/` and then the `NNNpx-` size segment collapses the
    // entire path to `/`, with no filename left. That trips the guard in
    // upgradeToOriginal, which must discard the rewrite and return the input
    // unchanged rather than emit a rewritten-but-broken URL.
    const input = 'https://upload.wikimedia.org/thumb/220px-Example.jpg';
    const r = upgradeToOriginal(input);
    expect(r.original).toBe(input);
    expect(r.thumbnail).toBeUndefined();
  });
});

describe('looksLikeMediaUrl', () => {
  it('accepts media extensions, CDN hosts, and format params', () => {
    expect(looksLikeMediaUrl('https://x.com/a.jpg')).toBe(true);
    expect(looksLikeMediaUrl('https://x.com/a.mp4?t=1')).toBe(true);
    expect(looksLikeMediaUrl('https://pbs.twimg.com/media/AbC?format=jpg&name=small')).toBe(true);
    expect(looksLikeMediaUrl('https://x.com/article/hello')).toBe(false);
  });
});

describe('deproxy', () => {
  it('unwraps a Next.js image URL', () => {
    const u = 'https://site.com/_next/image?url=' + encodeURIComponent('https://cdn.com/a.jpg') + '&w=640&q=75';
    expect(deproxy(u)).toBe('https://cdn.com/a.jpg');
  });
  it('unwraps weserv and generic ?url=', () => {
    expect(deproxy('https://images.weserv.nl/?url=cdn.com%2Fb.png')).toBe('https://cdn.com/b.png');
    expect(deproxy('https://p.com/proxy?src=' + encodeURIComponent('https://cdn.com/c.webp'))).toBe('https://cdn.com/c.webp');
  });
  it('unwraps a Cloudinary fetch URL', () => {
    expect(deproxy('https://res.cloudinary.com/demo/image/fetch/w_200/https://cdn.com/d.jpg')).toBe('https://cdn.com/d.jpg');
  });
  it('returns null when the wrapped value is not media', () => {
    expect(deproxy('https://site.com/page?url=' + encodeURIComponent('https://cdn.com/article'))).toBeNull();
    expect(deproxy('https://cdn.com/plain.jpg')).toBeNull();
  });
  it('upgradeToOriginal de-proxies then keeps the wrapper as thumbnail', () => {
    const u = 'https://site.com/_next/image?url=' + encodeURIComponent('https://cdn.com/a.jpg') + '&w=64';
    expect(upgradeToOriginal(u)).toEqual({ original: 'https://cdn.com/a.jpg', thumbnail: u });
  });
});

describe('CDN rules — path-based upgrades', () => {
  const orig = (u: string) => upgradeToOriginal(u).original;
  it('Google usercontent size segment -> s0', () => {
    expect(orig('https://lh3.googleusercontent.com/abc=s200-c')).toBe('https://lh3.googleusercontent.com/abc=s0');
    expect(orig('https://lh3.googleusercontent.com/abc=w200-h200')).toBe('https://lh3.googleusercontent.com/abc=s0');
  });
  it('Pinterest size folder -> originals', () => {
    expect(orig('https://i.pinimg.com/564x/aa/bb/cc.jpg')).toBe('https://i.pinimg.com/originals/aa/bb/cc.jpg');
  });
  it('YouTube thumb -> maxresdefault', () => {
    expect(orig('https://i.ytimg.com/vi/ID123/hqdefault.jpg')).toBe('https://i.ytimg.com/vi/ID123/maxresdefault.jpg');
  });
  it('Amazon strips the encoding segment', () => {
    expect(orig('https://m.media-amazon.com/images/I/abc._SX300_SY300_.jpg')).toBe('https://m.media-amazon.com/images/I/abc.jpg');
  });
  it('leaves signed fbcdn/reddit-preview query intact', () => {
    const fb = 'https://scontent.xx.fbcdn.net/v/t1.0/x.jpg?stp=dst-jpg&_nc_ht=y&oh=SIG';
    expect(orig(fb)).toBe(fb);
  });
  it('Medium strips chained transform segments', () => {
    expect(orig('https://miro.medium.com/v2/resize:fit:720/format:webp/1*xyz.png')).toBe('https://miro.medium.com/1*xyz.png');
  });
  it('does not match look-alike hostnames', () => {
    expect(orig('https://evilgoogleusercontent.com/abc=s200')).toBe('https://evilgoogleusercontent.com/abc=s200');
    expect(orig('https://fakemedia-amazon.com/x._SX300_.jpg')).toBe('https://fakemedia-amazon.com/x._SX300_.jpg');
  });
});
