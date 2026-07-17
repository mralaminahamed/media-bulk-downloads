import {
  deproxy,
  detectType,
  looksLikeMediaUrl,
  parseUrlDimensions,
  upgradeToOriginal,
} from '@mbd/core/collection/imageUrl';

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

  it('reads the bluesky @<fmt> path suffix (extension-less atproto CDN)', () => {
    expect(detectType('https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafy123@jpeg')).toBe('jpeg');
    expect(detectType('https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafy123@png')).toBe('png');
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
    // h-only: the width falls back to 0 via `Number.isFinite(w) ? w : 0` (w is NaN).
    expect(parseUrlDimensions('https://img.test/a?h=800')).toEqual({ width: 0, height: 800 });
  });

  it('returns null for named sizes and size-free urls', () => {
    expect(parseUrlDimensions('https://pbs.twimg.com/media/ABC?name=orig')).toBeNull();
    expect(parseUrlDimensions('https://img.test/photo.jpg')).toBeNull();
  });

  it('does not read a WxH embedded in an alphanumeric id token', () => {
    // `12x34` sits inside the opaque token `a12x34b` — not a real size token.
    expect(parseUrlDimensions('https://cdn.test/a12x34b/photo.jpg')).toBeNull();
    // but a real, boundary-delimited token still parses.
    expect(parseUrlDimensions('https://cdn.test/hero-1920x1080.jpg')).toEqual({ width: 1920, height: 1080 });
  });

  it('does not read a slash-delimited path segment as a size (date/id false positive)', () => {
    // `/12x34/` is a bare path segment (a date/id folder), not a `_`/`-`/`=`-delimited
    // size token — reporting {12,34} here would wrongly filter out a large image.
    expect(parseUrlDimensions('https://cdn.test/2024/12x34/photo.jpg')).toBeNull();
    // A dimension folder without a separator is likewise not trusted (returns null →
    // unknown size → not filtered, rather than a possibly-wrong tiny size).
    expect(parseUrlDimensions('https://cdn.test/800x600/photo.jpg')).toBeNull();
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
    [
      'squarespace forces format=2500w',
      'https://images.squarespace-cdn.com/content/abc/def/photo.jpg?format=500w',
      'https://images.squarespace-cdn.com/content/abc/def/photo.jpg?format=2500w',
    ],
    [
      'wix strips the /v1/fill transform back to the base media file',
      'https://static.wixstatic.com/media/0784b1_abc~mv2.jpg/v1/fill/w_105,h_159,al_c,q_80,enc_avif/Group.jpg',
      'https://static.wixstatic.com/media/0784b1_abc~mv2.jpg',
    ],
    [
      'bluesky feed_thumbnail -> feed_fullsize',
      'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc/bafkrei123@jpeg',
      'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/bafkrei123@jpeg',
    ],
    [
      'bandcamp art size code -> _0 original',
      'https://f4.bcbits.com/img/a3164574832_10.jpg',
      'https://f4.bcbits.com/img/a3164574832_0.jpg',
    ],
    [
      'IIIF size segment -> full (LoC)',
      'https://tile.loc.gov/image-services/iiif/service:pnp:abc/full/pct:50/0/default.jpg',
      'https://tile.loc.gov/image-services/iiif/service:pnp:abc/full/full/0/default.jpg',
    ],
    [
      'IIIF upgrades size while preserving an explicit crop region',
      'https://iiif.example.org/ark:/12345/id/125,15,120,140/!300,300/0/default.jpg',
      'https://iiif.example.org/ark:/12345/id/125,15,120,140/full/0/default.jpg',
    ],
    [
      'rawpixel drops resize params (imgix vanity host)',
      'https://images.rawpixel.com/image_1300/cHJpdmF0ZS9sci9pbWFnZXM.jpg?w=1300&h=800&q=80',
      'https://images.rawpixel.com/image_1300/cHJpdmF0ZS9sci9pbWFnZXM.jpg',
    ],
    [
      'Sanity strips the imgix transform to the master (native dims in filename)',
      'https://cdn.sanity.io/images/prj/ds/abc-2218x1479.jpg?w=800&h=600&fit=crop&auto=format',
      'https://cdn.sanity.io/images/prj/ds/abc-2218x1479.jpg',
    ],
    [
      'Contentful strips the imgix transform to the master',
      'https://images.ctfassets.net/space/asset/hash/photo.jpg?w=400&h=300&fit=fill&fm=webp',
      'https://images.ctfassets.net/space/asset/hash/photo.jpg',
    ],
    [
      'Sirv strips the dynamic resizer query',
      'https://demo.sirv.com/product.jpg?w=300&h=200&scale.width=300&q=80',
      'https://demo.sirv.com/product.jpg',
    ],
    [
      'Storyblok drops the /m/ service segment to the master',
      'https://a.storyblok.com/f/39898/3310x2192/hash/image.jpg/m/1200x795/filters:format(webp)',
      'https://a.storyblok.com/f/39898/3310x2192/hash/image.jpg',
    ],
    [
      'Uploadcare strips the -/ operations to the bare-UUID original',
      'https://ucarecdn.com/8f1e2d3c-0000-1111-2222-abcdef012345/-/resize/800x/-/format/auto/',
      'https://ucarecdn.com/8f1e2d3c-0000-1111-2222-abcdef012345/',
    ],
    [
      'ImageKit drops the ?tr= query to the original',
      'https://ik.imagekit.io/demo/default-image.jpg?tr=w-300,h-200',
      'https://ik.imagekit.io/demo/default-image.jpg',
    ],
    [
      'ImageKit strips the /tr:/ path segment to the original',
      'https://ik.imagekit.io/demo/tr:w-300,h-200/default-image.jpg',
      'https://ik.imagekit.io/demo/default-image.jpg',
    ],
    [
      'Cloudflare /cdn-cgi/image/ unwraps an absolute src',
      'https://example.com/cdn-cgi/image/width=800,quality=75/https://origin.com/hero.jpg',
      'https://origin.com/hero.jpg',
    ],
    [
      'Cloudflare /cdn-cgi/image/ unwraps a same-origin src',
      'https://example.com/cdn-cgi/image/width=800/uploads/hero.jpg',
      'https://example.com/uploads/hero.jpg',
    ],
    [
      'Met swaps web-large -> original (CC0 master)',
      'https://images.metmuseum.org/CRDImages/ep/web-large/DT1234.jpg',
      'https://images.metmuseum.org/CRDImages/ep/original/DT1234.jpg',
    ],
    [
      'NASA swaps ~medium -> ~orig',
      'https://images-assets.nasa.gov/image/PIA12345/PIA12345~medium.jpg',
      'https://images-assets.nasa.gov/image/PIA12345/PIA12345~orig.jpg',
    ],
    [
      'NatGeo strips ?w&h to the master',
      'https://i.natgeofe.com/n/abc-uuid-1234/photo.jpg?w=760&h=500',
      'https://i.natgeofe.com/n/abc-uuid-1234/photo.jpg',
    ],
    [
      'Nike replaces the Cloudinary transform with w_2000,c_limit,f_auto',
      'https://static.nike.com/a/images/c_limit,w_592,f_auto,q_auto:eco/hash-uuid/air.png',
      'https://static.nike.com/a/images/w_2000,c_limit,f_auto/hash-uuid/air.png',
    ],
    [
      'adidas raises w_600 -> w_1920',
      'https://assets.adidas.com/images/w_600,f_auto,q_auto/abc123/shoe.jpg',
      'https://assets.adidas.com/images/w_1920,f_auto,q_auto/abc123/shoe.jpg',
    ],
    [
      'adidas brand subdomain also matches',
      'https://brand.assets.adidas.com/images/w_500,f_auto/x/y.jpg',
      'https://brand.assets.adidas.com/images/w_1920,f_auto/x/y.jpg',
    ],
    [
      'Flaticon raises the size segment to the 512 free ceiling',
      'https://cdn-icons-png.flaticon.com/128/25/25231.png',
      'https://cdn-icons-png.flaticon.com/512/25/25231.png',
    ],
    [
      'pxhere sets the size token to !d (download original)',
      'https://c.pxhere.com/photos/3b/5b/swan_bird_lake-1254062.jpg!s1',
      'https://c.pxhere.com/photos/3b/5b/swan_bird_lake-1254062.jpg!d',
    ],
    [
      'pxhere appends !d to a bare path (bare .jpg 403s)',
      'https://c.pxhere.com/photos/3b/5b/swan_bird_lake-1254062.jpg',
      'https://c.pxhere.com/photos/3b/5b/swan_bird_lake-1254062.jpg!d',
    ],
    [
      'AlphaCoders strips the thumb-<N>- prefix to the original',
      'https://images2.alphacoders.com/433/thumb-350-43350.jpg',
      'https://images2.alphacoders.com/433/43350.jpg',
    ],
    [
      'WallpaperFlare strips -thumbnail, keeping the /preview/ path',
      'https://c0.wallpaperflare.com/preview/283/479/652/ancient-antique-art-thumbnail.jpg',
      'https://c0.wallpaperflare.com/preview/283/479/652/ancient-antique-art.jpg',
    ],
    [
      'LiveJournal swaps the size token for _original',
      'https://ic.pics.livejournal.com/livejournal/21331/110834/110834_800.png',
      'https://ic.pics.livejournal.com/livejournal/21331/110834/110834_original.png',
    ],
    [
      'LiveJournal swaps a WxH size token (100x100) for _original',
      'https://ic.pics.livejournal.com/someuser/12345/67890/67890_100x100.jpg',
      'https://ic.pics.livejournal.com/someuser/12345/67890/67890_original.jpg',
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

  it('cloudinary strips a single-param transform and chained transform segments', () => {
    expect(upgradeToOriginal('https://res.cloudinary.com/demo/image/upload/w_500/sample.jpg').original)
      .toBe('https://res.cloudinary.com/demo/image/upload/sample.jpg');
    // chained: /w_300/e_blur/ — both are transform segments
    expect(upgradeToOriginal('https://res.cloudinary.com/demo/image/upload/w_300/e_blur/sample.jpg').original)
      .toBe('https://res.cloudinary.com/demo/image/upload/sample.jpg');
  });

  it('cloudinary keeps the public-id folder and stops at the version segment', () => {
    // a real transform followed by a public-id folder: strip only the transform
    expect(upgradeToOriginal('https://res.cloudinary.com/demo/image/upload/w_300/folder/sample.jpg').original)
      .toBe('https://res.cloudinary.com/demo/image/upload/folder/sample.jpg');
    // version segment (v123…) is not a transform — leave everything from it on
    const versioned = 'https://res.cloudinary.com/demo/image/upload/v1699999999/folder/sample.jpg';
    expect(upgradeToOriginal(versioned).original).toBe(versioned);
  });

  it('cloudinary does NOT strip a folder whose name merely contains w_/h_/c_/q_', () => {
    // These are public-id folders, not transforms — the old substring rule 404'd them.
    for (const url of [
      'https://res.cloudinary.com/demo/image/upload/mac_photos/img.jpg', // contains "c_"
      'https://res.cloudinary.com/demo/image/upload/q_and_a/img.jpg',    // starts "q_", value has "_"
      'https://res.cloudinary.com/demo/image/upload/new_w_series/img.jpg', // contains "w_"
    ]) {
      const r = upgradeToOriginal(url);
      expect(r.original).toBe(url);
      expect(r.thumbnail).toBeUndefined();
    }
  });

  it('LiveJournal is idempotent on an already-original URL (no-op, no thumbnail)', () => {
    const url = 'https://ic.pics.livejournal.com/livejournal/21331/110834/110834_original.png';
    const r = upgradeToOriginal(url);
    expect(r.original).toBe(url);
    expect(r.thumbnail).toBeUndefined();
  });

  it('leaves a pbs.twimg.com URL unchanged when it carries no name param to rewrite', () => {
    // The Twitter rule matches on host, but its rewrite only fires when a `name`
    // param exists. With none present the rewrite is a no-op, so upgradeToOriginal
    // returns the input untouched and emits no thumbnail.
    const r = upgradeToOriginal('https://pbs.twimg.com/media/ABC?format=jpg');
    expect(r.original).toBe('https://pbs.twimg.com/media/ABC?format=jpg');
    expect(r.thumbnail).toBeUndefined();
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

  it('IIIF collapses every size variant of one image to a single origin URL', () => {
    // Different {size} renditions of the same identifier all upgrade to /full/, so
    // they dedup to one output URL downstream.
    const base = 'https://iiif.example.org/id/full';
    const outputs = ['pct:50', '800,', ',600', '!400,400'].map(
      (size) => upgradeToOriginal(`${base}/${size}/0/default.jpg`).original,
    );
    expect(new Set(outputs)).toEqual(new Set([`${base}/full/0/default.jpg`]));
  });

  it('IIIF preserves rotation, quality and format while upgrading the size', () => {
    const r = upgradeToOriginal('https://iiif.example.org/id/full/800,/90/color.png');
    expect(r.original).toBe('https://iiif.example.org/id/full/full/90/color.png');
    expect(r.thumbnail).toBe('https://iiif.example.org/id/full/800,/90/color.png');
  });

  it('IIIF leaves an already-largest size (full or max) unchanged', () => {
    for (const size of ['full', 'max']) {
      const url = `https://iiif.example.org/id/full/${size}/0/default.jpg`;
      const r = upgradeToOriginal(url);
      expect(r.original).toBe(url);
      expect(r.thumbnail).toBeUndefined();
    }
  });

  it('IIIF does not match a non-IIIF path with a coincidental default.jpg tail', () => {
    // region "2020" / size "03" are not valid IIIF tokens, so the tail shape alone
    // must not trigger a rewrite (that would 404 a plain dated gallery path).
    for (const url of [
      'https://cdn.example.com/gallery/2020/03/15/default.jpg', // dated path, not IIIF
      'https://cdn.example.com/assets/full/logo.png', // coincidental /full/, no IIIF tail
    ]) {
      const r = upgradeToOriginal(url);
      expect(r.original).toBe(url);
      expect(r.thumbnail).toBeUndefined();
    }
  });

  it('leaves an ImageKit signed URL (ik-s=) untouched — a path edit would break it', () => {
    const url = 'https://ik.imagekit.io/demo/tr:w-300/default-image.jpg?ik-s=abc123def';
    const r = upgradeToOriginal(url);
    expect(r.original).toBe(url);
    expect(r.thumbnail).toBeUndefined();
  });

  it('Sanity size variants of one image dedup to a single master URL', () => {
    const master = 'https://cdn.sanity.io/images/prj/ds/abc-2218x1479.jpg';
    const outputs = ['?w=800', '?w=1600&h=900&fit=crop', '?w=400&auto=format&q=70'].map(
      (q) => upgradeToOriginal(master + q).original,
    );
    expect(new Set(outputs)).toEqual(new Set([master]));
  });

  it('Sirv matches any subdomain under sirv.com', () => {
    const r = upgradeToOriginal('https://mybrand.sirv.com/a/b/photo.png?w=200&scale.width=200');
    expect(r.original).toBe('https://mybrand.sirv.com/a/b/photo.png');
    expect(r.thumbnail).toBe('https://mybrand.sirv.com/a/b/photo.png?w=200&scale.width=200');
  });

  it('leaves a Storyblok/Uploadcare master (no transform segment) unchanged', () => {
    for (const url of [
      'https://a.storyblok.com/f/39898/3310x2192/hash/image.jpg', // no /m/ segment
      'https://ucarecdn.com/8f1e2d3c-0000-1111-2222-abcdef012345/', // bare UUID, no -/ ops
    ]) {
      const r = upgradeToOriginal(url);
      expect(r.original).toBe(url);
      expect(r.thumbnail).toBeUndefined();
    }
  });

  it('leaves Met/NASA URLs already at the master size unchanged', () => {
    for (const url of [
      'https://images.metmuseum.org/CRDImages/ep/original/DT1234.jpg', // already /original/
      'https://images-assets.nasa.gov/image/PIA12345/PIA12345~orig.jpg', // already ~orig
    ]) {
      const r = upgradeToOriginal(url);
      expect(r.original).toBe(url);
      expect(r.thumbnail).toBeUndefined();
    }
  });

  it('does not touch a Nike path whose first segment is not a Cloudinary transform', () => {
    // A bare original (no transform segment before the hash) must be left alone —
    // isCloudinaryTransform gates the swap so the hash is never mistaken for one.
    const url = 'https://static.nike.com/a/images/abcdef123456/air.png';
    const r = upgradeToOriginal(url);
    expect(r.original).toBe(url);
    expect(r.thumbnail).toBeUndefined();
  });

  it('adidas never downgrades a width already >= 1920', () => {
    const url = 'https://assets.adidas.com/images/w_2500,f_auto/abc/shoe.jpg';
    const r = upgradeToOriginal(url);
    expect(r.original).toBe(url);
    expect(r.thumbnail).toBeUndefined();
  });

  it('leaves Tier-4 assets already at their largest rendition unchanged', () => {
    for (const url of [
      'https://cdn-icons-png.flaticon.com/512/25/25231.png', // already the 512 ceiling
      'https://c.pxhere.com/photos/3b/5b/swan-1254062.jpg!d', // already !d
      'https://images2.alphacoders.com/433/43350.jpg', // already the bare original
      'https://c0.wallpaperflare.com/preview/283/479/652/ancient-art.jpg', // no -thumbnail suffix
    ]) {
      const r = upgradeToOriginal(url);
      expect(r.original).toBe(url);
      expect(r.thumbnail).toBeUndefined();
    }
  });

  it('Flaticon never downgrades an icon already larger than the 512 ceiling', () => {
    const url = 'https://cdn-icons-png.flaticon.com/1024/25/25231.png';
    const r = upgradeToOriginal(url);
    expect(r.original).toBe(url);
    expect(r.thumbnail).toBeUndefined();
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

  it('leaves a squarespace url already at format=2500w unchanged', () => {
    const url = 'https://images.squarespace-cdn.com/content/a/b/x.jpg?format=2500w';
    const r = upgradeToOriginal(url);
    expect(r.original).toBe(url);
    expect(r.thumbnail).toBeUndefined();
  });

  it('does not rewrite a bandcamp non-art image lacking the a<id> art prefix', () => {
    // Band/bio photos use a bare-digit id (no leading `a`) and have no guaranteed
    // _0 sibling, so the rule is scoped to the a<digits> album/track-art prefix.
    const url = 'https://f4.bcbits.com/img/0123456789_10.jpg';
    const r = upgradeToOriginal(url);
    expect(r.original).toBe(url);
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

  it('rejects a non-media format param', () => {
    expect(looksLikeMediaUrl('https://site.com/export?format=csv')).toBe(false);
    expect(looksLikeMediaUrl('https://cdn.example.org/x?format=jpg')).toBe(true);
  });

  it('accepts the cdn.bsky.app host (extension-less @jpeg feed images)', () => {
    expect(looksLikeMediaUrl('https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafy123@jpeg')).toBe(true);
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
  it('unwraps a Cloudflare /cdn-cgi/image/ URL (absolute and same-origin src)', () => {
    expect(deproxy('https://ex.com/cdn-cgi/image/width=800,quality=75/https://origin.com/hero.jpg'))
      .toBe('https://origin.com/hero.jpg');
    expect(deproxy('https://ex.com/cdn-cgi/image/width=800/uploads/hero.jpg'))
      .toBe('https://ex.com/uploads/hero.jpg');
  });
  it('does NOT treat a /cdn-cgi/image/ path without an options segment as a proxy', () => {
    // The first segment must look like an options list (contain `=`); a bare
    // `.../cdn-cgi/image/logo.jpg` is not unwrapped (would otherwise misfire).
    expect(deproxy('https://ex.com/cdn-cgi/image/logo.jpg')).toBeNull();
  });
  it('returns null when the wrapped value is not media', () => {
    expect(deproxy('https://site.com/page?url=' + encodeURIComponent('https://cdn.com/article'))).toBeNull();
    expect(deproxy('https://cdn.com/plain.jpg')).toBeNull();
  });
  it('does NOT unwrap a real image that merely carries a ?src=/?url= param', () => {
    // The outer path is itself a media file → it's a real asset with a tracking
    // param, not a proxy; unwrapping would swap it for the param target.
    expect(deproxy('https://cdn.com/photo.jpg?src=' + encodeURIComponent('https://evil.com/pixel.png'))).toBeNull();
    expect(deproxy('https://cdn.com/hero.png?url=' + encodeURIComponent('https://cdn.com/other.jpg'))).toBeNull();
  });
  it('resolves a relative Next.js _next/image url against the proxy origin', () => {
    expect(deproxy('https://nextjs.org/_next/image?url=' + encodeURIComponent('/static/team/imm.jpeg') + '&w=48&q=75'))
      .toBe('https://nextjs.org/static/team/imm.jpeg');
    // a relative non-media inner path is still ignored
    expect(deproxy('https://nextjs.org/_next/image?url=' + encodeURIComponent('/about') + '&w=48')).toBeNull();
  });
  it('unwraps a Misskey /proxy/ media URL (path ends in .webp, beats the MEDIA_EXT guard)', () => {
    const original = 'https://media.misskeyusercontent.com/io/webpublic-abc.webp';
    expect(deproxy('https://p1.a9z.dev/proxy/static.webp?url=' + encodeURIComponent(original) + '&static=1'))
      .toBe(original);
  });
  it('unwraps the misskey.io path-encoded proxy (proxy.misskeyusercontent.jp)', () => {
    // scheme-stripped, percent-encoded original carried IN the path
    const enc = encodeURIComponent('media.misskeyusercontent.com/io/webpublic-abc.webp');
    expect(deproxy('https://proxy.misskeyusercontent.jp/image/' + enc + '?static=1'))
      .toBe('https://media.misskeyusercontent.com/io/webpublic-abc.webp');
  });
  it('unwraps a Lemmy image_proxy URL via the generic ?url= pass (no ext on the path)', () => {
    const original = 'https://sopuli.xyz/pictrs/image/abc.jpeg';
    expect(deproxy('https://lemmy.ml/api/v3/image_proxy?url=' + encodeURIComponent(original)))
      .toBe(original);
  });
  it('upgradeToOriginal de-proxies then keeps the wrapper as thumbnail', () => {
    const u = 'https://site.com/_next/image?url=' + encodeURIComponent('https://cdn.com/a.jpg') + '&w=64';
    expect(upgradeToOriginal(u)).toEqual({ original: 'https://cdn.com/a.jpg', thumbnail: u });
  });
  it('keeps the raw inner value when its percent-encoding is malformed (safeDecode fallback)', () => {
    // `%ZZ` is not a valid escape — decodeURIComponent throws inside safeDecode,
    // which must fall back to the raw string rather than crash, so the media URL
    // is still unwrapped (exercises both the weserv and generic proxy paths).
    expect(deproxy('https://images.weserv.nl/?url=https://cdn.com/a%ZZ.png'))
      .toBe('https://cdn.com/a%ZZ.png');
    expect(deproxy('https://p.com/proxy?src=https%3A%2F%2Fcdn.com%2Fa%ZZ.png'))
      .toBe('https://cdn.com/a%ZZ.png');
  });

  it('returns null for a Cloudinary /image/fetch/ whose inner path has no scheme', () => {
    // After stripping the `w_200/` transform the inner is a bare relative path with
    // no `http(s)://` — the ternary yields null, so the fetch branch produces
    // nothing and the URL is not treated as a proxy.
    expect(deproxy('https://res.cloudinary.com/demo/image/fetch/w_200/relative-no-scheme.jpg'))
      .toBeNull();
  });

  it('returns null for a weserv URL that carries no ?url= param', () => {
    // The `if (raw)` guard is false, so the weserv branch is skipped entirely.
    expect(deproxy('https://images.weserv.nl/?foo=bar')).toBeNull();
  });

  it('returns null for a weserv URL whose ?url= target is not media', () => {
    // The decoded inner (`https://example.com/page`) is not a media URL, so the
    // `looksLikeMediaUrl(abs)` guard fails and the branch yields nothing.
    expect(deproxy('https://images.weserv.nl/?url=example.com/page')).toBeNull();
  });

  it('returns null for a generic proxy param that is neither absolute nor root-relative', () => {
    // `relative-thing` has no scheme and no leading `/`, so both branches of the
    // inner resolution are skipped and `abs` stays null.
    expect(deproxy('https://p.com/proxy?url=relative-thing')).toBeNull();
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
    // WxH folder (e.g. /200x150/) upgrades too.
    expect(orig('https://i.pinimg.com/200x150/aa/bb/cc.jpg')).toBe('https://i.pinimg.com/originals/aa/bb/cc.jpg');
    // Responsive smart-crop folders carry an `_RS` suffix (/30x30_RS/, /75x75_RS/,
    // /280x280_RS/). These are still keyed by the same hash, so /originals/ exists
    // (verified HTTP 200 against a real board) — upgrade them like any other size.
    expect(orig('https://i.pinimg.com/280x280_RS/aa/bb/cc.jpg')).toBe('https://i.pinimg.com/originals/aa/bb/cc.jpg');
    expect(orig('https://i.pinimg.com/75x75_RS/aa/bb/cc.jpg')).toBe('https://i.pinimg.com/originals/aa/bb/cc.jpg');
    expect(orig('https://i.pinimg.com/30x30_RS/aa/bb/cc.jpg')).toBe('https://i.pinimg.com/originals/aa/bb/cc.jpg');
    // Already-original URLs are left untouched (idempotent).
    expect(orig('https://i.pinimg.com/originals/aa/bb/cc.jpg')).toBe('https://i.pinimg.com/originals/aa/bb/cc.jpg');
  });
  it('YouTube small thumb -> hqdefault; larger variants left untouched', () => {
    // hqdefault is the largest variant guaranteed to exist; maxres/sd often 404
    // and can't be probed network-free, so we never synthesize them. See #74.
    expect(orig('https://i.ytimg.com/vi/ID123/default.jpg')).toBe('https://i.ytimg.com/vi/ID123/hqdefault.jpg');
    expect(orig('https://i.ytimg.com/vi/ID123/mqdefault.jpg')).toBe('https://i.ytimg.com/vi/ID123/hqdefault.jpg');
    expect(orig('https://i.ytimg.com/vi/ID123/hqdefault.jpg')).toBe('https://i.ytimg.com/vi/ID123/hqdefault.jpg');
    expect(orig('https://i.ytimg.com/vi/ID123/maxresdefault.jpg')).toBe('https://i.ytimg.com/vi/ID123/maxresdefault.jpg');
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
  it('modern Shopify /cdn/shop on the store domain drops size query', () => {
    expect(orig('https://www.allbirds.com/cdn/shop/files/x.jpg?width=800&crop=center')).toBe(
      'https://www.allbirds.com/cdn/shop/files/x.jpg',
    );
    // classic cdn.shopify.com _WxH suffix still handled
    expect(orig('https://cdn.shopify.com/s/files/1/x_800x600.jpg')).toBe('https://cdn.shopify.com/s/files/1/x.jpg');
  });
  it('Unsplash plus subdomain strips resize params', () => {
    expect(orig('https://plus.unsplash.com/premium_photo-123?w=400&q=80&fit=crop')).toBe(
      'https://plus.unsplash.com/premium_photo-123',
    );
  });
});

describe('image-CDN rule batch (2026-07-05)', () => {
  const orig = (u: string) => upgradeToOriginal(u).original;

  it('Pexels: strips the resize query', () => {
    expect(orig('https://images.pexels.com/photos/12762122/pexels-photo-12762122.jpeg?auto=compress&dpr=1&w=252&h=408&fit=crop'))
      .toBe('https://images.pexels.com/photos/12762122/pexels-photo-12762122.jpeg');
  });
  it('Pixabay: _<size> -> _1280', () => {
    expect(orig('https://cdn.pixabay.com/photo/2024/02/12/16/05/siguniang-mountain-8568913_640.jpg'))
      .toBe('https://cdn.pixabay.com/photo/2024/02/12/16/05/siguniang-mountain-8568913_1280.jpg');
    expect(orig('https://cdn.pixabay.com/photo/2024/02/12/16/05/x_1280.jpg'))
      .toBe('https://cdn.pixabay.com/photo/2024/02/12/16/05/x_1280.jpg');
  });
  it('Flickr: _<size> -> _b, leaves the secret alone', () => {
    expect(orig('https://live.staticflickr.com/4556/24708106728_ce5296f1f9_z.jpg'))
      .toBe('https://live.staticflickr.com/4556/24708106728_ce5296f1f9_b.jpg');
    // a URL with no size code (just id_secret) must be untouched
    expect(orig('https://live.staticflickr.com/4556/24708106728_ce5296f1f9.jpg'))
      .toBe('https://live.staticflickr.com/4556/24708106728_ce5296f1f9.jpg');
    // already >= _b (1024) must NOT be downgraded
    expect(orig('https://live.staticflickr.com/4556/24708106728_ce5296f1f9_o.jpg'))
      .toBe('https://live.staticflickr.com/4556/24708106728_ce5296f1f9_o.jpg');
    expect(orig('https://live.staticflickr.com/4556/24708106728_ce5296f1f9_k.jpg'))
      .toBe('https://live.staticflickr.com/4556/24708106728_ce5296f1f9_k.jpg');
  });
  it('Tumblr: size folders are left unchanged (only the served size exists)', () => {
    // 64.media.tumblr.com renders exactly one size per image; every other /sWxH/
    // 404s, so a blind rewrite replaced a working image with a dead link. See #72.
    const large = 'https://64.media.tumblr.com/abc123/def456-d6/s2048x3072/hash.png';
    expect(orig(large)).toBe(large);
    const small = 'https://64.media.tumblr.com/s540x810/f7494899f3c89b950936982cf1b05747f2d82ea2.jpg';
    expect(orig(small)).toBe(small);
  });
  it('BBC: width segment -> 2048 (news + ace/standard; 1920 404s on news)', () => {
    expect(orig('https://ichef.bbci.co.uk/news/640/cpsprodpb/9c6f/live/aa7b3860.jpg'))
      .toBe('https://ichef.bbci.co.uk/news/2048/cpsprodpb/9c6f/live/aa7b3860.jpg');
    expect(orig('https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/abc/live/def.jpg'))
      .toBe('https://ichef.bbci.co.uk/ace/standard/2048/cpsprodpb/abc/live/def.jpg');
  });
  it('Etsy: il_WxH -> il_fullxfull', () => {
    expect(orig('https://i.etsystatic.com/38572517/r/il/a2a0a2/8011468755/il_765x956.8011468755_foh5.jpg'))
      .toBe('https://i.etsystatic.com/38572517/r/il/a2a0a2/8011468755/il_fullxfull.8011468755_foh5.jpg');
  });
  it('eBay: s-l<NNN> -> s-l1600', () => {
    expect(orig('https://i.ebayimg.com/images/g/-wEAAOSwVoJlqbkV/s-l500.webp'))
      .toBe('https://i.ebayimg.com/images/g/-wEAAOSwVoJlqbkV/s-l1600.webp');
  });
  it('The Verge: strips the WP resize query', () => {
    expect(orig('https://platform.theverge.com/wp-content/uploads/sites/2/2026/07/IMG2026.jpeg?quality=90&crop=0,0&w=2400'))
      .toBe('https://platform.theverge.com/wp-content/uploads/sites/2/2026/07/IMG2026.jpeg');
  });
  it('Self-hosted WordPress: drops resize query and -WxH/-scaled suffix', () => {
    // stored -WxH thumbnail on an arbitrary WP host -> untouched original
    expect(orig('https://wptavern.com/wp-content/uploads/2020/06/generate-blocks-example-500x262.png'))
      .toBe('https://wptavern.com/wp-content/uploads/2020/06/generate-blocks-example.png');
    // ?w= resizer -> bare original
    expect(orig('https://techcrunch.com/wp-content/uploads/2026/07/google.jpg?w=150'))
      .toBe('https://techcrunch.com/wp-content/uploads/2026/07/google.jpg');
    // -scaled (WP big-image) suffix stripped
    expect(orig('https://example.org/wp-content/uploads/2026/01/photo-scaled.jpg'))
      .toBe('https://example.org/wp-content/uploads/2026/01/photo.jpg');
  });
  it('Self-hosted MediaWiki (wikiHow): drops /thumb/ and size segment', () => {
    expect(orig('https://www.wikihow.com/images/thumb/0/00/Pet-a-Cat-Step-1.jpg/v4-460px-Pet-a-Cat-Step-1.jpg'))
      .toBe('https://www.wikihow.com/images/0/00/Pet-a-Cat-Step-1.jpg');
    // Wikimedia (upload.wikimedia.org) still works via the same rule
    expect(orig('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat.jpg/320px-Cat.jpg'))
      .toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg');
  });
  it('Adobe Scene7: forces wid=2000 and drops hei/qlt/fmt', () => {
    expect(orig('https://target.scene7.com/is/image/Target/GUEST_abc?wid=100&hei=100&qlt=80&fmt=pjpeg'))
      .toBe('https://target.scene7.com/is/image/Target/GUEST_abc?wid=2000');
    // a bare ref (no query) gets an explicit large wid rather than the tiny default
    expect(orig('https://s7d1.scene7.com/is/image/brand/sku'))
      .toBe('https://s7d1.scene7.com/is/image/brand/sku?wid=2000');
  });
  it('ArtStation: upgrades the size bucket to /large/', () => {
    expect(orig('https://cdnb.artstation.com/p/assets/images/images/079/963/039/smaller_square/x.jpg?1726263061'))
      .toBe('https://cdnb.artstation.com/p/assets/images/images/079/963/039/large/x.jpg?1726263061');
    // already /large/ -> unchanged
    expect(orig('https://cdna.artstation.com/p/assets/images/images/1/2/3/large/y.jpg'))
      .toBe('https://cdna.artstation.com/p/assets/images/images/1/2/3/large/y.jpg');
  });
  it('Walmart: drops the odn resize query', () => {
    expect(orig('https://i5.walmartimages.com/seo/x_ad4f.15c743a1.jpeg?odnHeight=180&odnWidth=180&odnBg=FFFFFF'))
      .toBe('https://i5.walmartimages.com/seo/x_ad4f.15c743a1.jpeg');
  });
  it('Dribbble: drops the resize query', () => {
    expect(orig('https://cdn.dribbble.com/userupload/48258936/file/7fc10d28ca5c.png?resize=400x300&vertical=center'))
      .toBe('https://cdn.dribbble.com/userupload/48258936/file/7fc10d28ca5c.png');
  });
  it('Newgrounds art: drops the ?f<ts> cache-buster to canonicalise (real 2026-07-13 sample)', () => {
    expect(orig('https://art.ngfiles.com/images/7911000/7911020_3470302_crisppyboat_untitled-7911020.931a76f2b3592b7c21538f41e26f3298.webp?f1783784331'))
      .toBe('https://art.ngfiles.com/images/7911000/7911020_3470302_crisppyboat_untitled-7911020.931a76f2b3592b7c21538f41e26f3298.webp');
    // thumbnails carry the same cache-buster
    expect(orig('https://art.ngfiles.com/thumbnails/5438000/5438293_full.webp?f1783791402'))
      .toBe('https://art.ngfiles.com/thumbnails/5438000/5438293_full.webp');
  });
  it('Temu: drops the imageView2 transform query, leaving other kwcdn URLs alone', () => {
    // Real documented sample (temu.com). The bare object is the original.
    expect(orig('https://img.kwcdn.com/product/open/f43f2d8284a345788144669b6e550238-goods.jpeg?imageView2/2/w/800/q/70/format/webp'))
      .toBe('https://img.kwcdn.com/product/open/f43f2d8284a345788144669b6e550238-goods.jpeg');
    // No imageView2 transform → not our rule → left unchanged.
    expect(orig('https://img.kwcdn.com/product/open/abc-goods.jpeg?sign=xyz')).toBe('https://img.kwcdn.com/product/open/abc-goods.jpeg?sign=xyz');
    expect(orig('https://img.kwcdn.com/product/open/abc-goods.jpeg')).toBe('https://img.kwcdn.com/product/open/abc-goods.jpeg');
  });
  it('AliExpress: strips the transform suffix after the real extension', () => {
    expect(orig('https://ae01.alicdn.com/kf/Se3b534ec8e074799b42a78eabde9534ad.jpg_640x640.jpg_.webp'))
      .toBe('https://ae01.alicdn.com/kf/Se3b534ec8e074799b42a78eabde9534ad.jpg');
    expect(orig('https://img.alicdn.com/imgextra/x.png_.webp'))
      .toBe('https://img.alicdn.com/imgextra/x.png');
    // no transform suffix -> unchanged
    expect(orig('https://ae01.alicdn.com/kf/Sabc.jpg'))
      .toBe('https://ae01.alicdn.com/kf/Sabc.jpg');
  });
  it('imgur: strips an 8-char thumbnail suffix, never a 7-char id', () => {
    // 8-char basename ending in a thumb letter -> original
    expect(orig('https://i.imgur.com/K3UCTivb.jpg')).toBe('https://i.imgur.com/K3UCTiv.jpg');
    // real 7-char id must be left alone (blind strip -> a different image, not 404)
    expect(orig('https://i.imgur.com/K3UCTiv.jpg')).toBe('https://i.imgur.com/K3UCTiv.jpg');
    // 8-char basename NOT ending in a thumb letter -> unchanged
    expect(orig('https://i.imgur.com/K3UCTivx.jpg')).toBe('https://i.imgur.com/K3UCTivx.jpg');
  });
  it('imgur: .gifv HTML wrapper -> the same-id .mp4 video original', () => {
    // .gifv is an HTML page; the same-id .mp4 is the actual video. Live-verified
    // on id 0gybAXR (2026-07-15): .gifv=text/html wrapper, .mp4=633 KB video/mp4.
    expect(orig('https://i.imgur.com/0gybAXR.gifv')).toBe('https://i.imgur.com/0gybAXR.mp4');
    // a plain image is untouched by the gifv branch
    expect(orig('https://i.imgur.com/0gybAXR.jpg')).toBe('https://i.imgur.com/0gybAXR.jpg');
  });
  it('NYT: swaps editorial crop to superJumbo and drops the query', () => {
    expect(orig('https://static01.nyt.com/images/2026/07/04/x/x-articleLarge.jpg?quality=75&auto=webp'))
      .toBe('https://static01.nyt.com/images/2026/07/04/x/x-superJumbo.jpg');
    expect(orig('https://static01.nyt.com/images/2026/07/04/x/x-mediumThreeByTwo440.jpg'))
      .toBe('https://static01.nyt.com/images/2026/07/04/x/x-superJumbo.jpg');
    // already superJumbo: only the quality query is dropped (higher-quality same crop)
    expect(orig('https://static01.nyt.com/images/x-superJumbo.jpg?quality=75&auto=webp'))
      .toBe('https://static01.nyt.com/images/x-superJumbo.jpg');
  });
  it('DeviantArt: upgrades to the JWT cap as /v1/fill/ q_100, keeping the token', () => {
    const payload = Buffer.from(JSON.stringify([[{ width: '<=1920', height: '<=1080' }]])).toString('base64url');
    const token = `hdr.${payload}.sig`;
    const base = 'https://images-wixmp-ed30a86b8c4ca887.wixmp.com/f/uuid/id.jpg';
    expect(orig(`${base}/v1/fit/w_375,h_211,q_70,strp/x.jpg?token=${token}`))
      .toBe(`${base}/v1/fill/w_1920,h_1080,q_100,strp/x.jpg?token=${token}`);
    // fail-safe: no token -> unchanged
    const noTok = `${base}/v1/fit/w_375,h_211,q_70,strp/x.jpg`;
    expect(orig(noTok)).toBe(noTok);
    // fail-safe: unparseable token -> unchanged
    const bad = `${base}/v1/fit/w_375,h_211,q_70,strp/x.jpg?token=garbage`;
    expect(orig(bad)).toBe(bad);
  });
  it('DeviantArt: leaves the URL untouched when the token payload cannot be read', () => {
    const base = 'https://images-wixmp-ed30a86b8c4ca887.wixmp.com/f/uuid/id.jpg';
    const path = '/v1/fit/w_375,h_211,q_70,strp/x.jpg';
    // Payload segment present, but it is not valid base64 → atob throws inside
    // decodeB64Url → cap unreadable → URL left as-is (never 403 by guessing).
    const badB64 = `${base}${path}?token=hdr.@@@@.sig`;
    expect(orig(badB64)).toBe(badB64);
    // Payload decodes to valid text but is not valid JSON → JSON.parse throws.
    const nonJson = `${base}${path}?token=hdr.${Buffer.from('not json{').toString('base64url')}.sig`;
    expect(orig(nonJson)).toBe(nonJson);
    // Payload is valid JSON but carries no usable width/height cap → null cap.
    const noDims = `${base}${path}?token=hdr.${Buffer.from(JSON.stringify([[{}]])).toString('base64url')}.sig`;
    expect(orig(noDims)).toBe(noDims);
  });
  it('IKEA: forces imwidth=2000, dropping the f resizer', () => {
    expect(orig('https://www.ikea.com/images/95/9e/959e6d9416a7a3c8.png?f=xxs'))
      .toBe('https://www.ikea.com/images/95/9e/959e6d9416a7a3c8.png?imwidth=2000');
    expect(orig('https://www.ikea.com/images/woman-sitting-sofa.jpg?f=xl'))
      .toBe('https://www.ikea.com/images/woman-sitting-sofa.jpg?imwidth=2000');
  });
  it('Zillow: swaps the size token to the max uncropped preset', () => {
    expect(orig('https://photos.zillowstatic.com/fp/324ac120ce544038519c4c932e45a6dd-p_e.webp'))
      .toBe('https://photos.zillowstatic.com/fp/324ac120ce544038519c4c932e45a6dd-uncropped_scaled_within_1536_1152.webp');
    // a .jpg thumb normalizes to the confirmed webp preset; query dropped
    expect(orig('https://photos.zillowstatic.com/fp/abc123-cc_ft_384.jpg?t=1'))
      .toBe('https://photos.zillowstatic.com/fp/abc123-uncropped_scaled_within_1536_1152.webp');
  });
  it('StockSnap: swaps the size token to 960w', () => {
    expect(orig('https://cdn.stocksnap.io/img-thumbs/280h/leaf-sunlight_7XDI39XPXY.jpg'))
      .toBe('https://cdn.stocksnap.io/img-thumbs/960w/leaf-sunlight_7XDI39XPXY.jpg');
  });
  it('Newegg: bumps the size-token folder to 1280', () => {
    expect(orig('https://c1.neweggimages.com/nobgproductcompressall300/19-113-737-V03.jpg'))
      .toBe('https://c1.neweggimages.com/nobgproductcompressall1280/19-113-737-V03.jpg');
    expect(orig('https://c1.neweggimages.com/productimagecompressall640/13-144-331-V01.jpg'))
      .toBe('https://c1.neweggimages.com/productimagecompressall1280/13-144-331-V01.jpg');
  });
  it('Substack: deproxy decodes the embedded S3 URL', () => {
    expect(deproxy('https://substackcdn.com/image/fetch/$s_!abc!,w_160,h_280,c_crop,f_auto,q_auto:good/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc.jpeg'))
      .toBe('https://substack-post-media.s3.amazonaws.com/public/images/abc.jpeg');
  });
});

describe('image-CDN rule batch (2026-07-15 Tier-1, GIF/video + free-stock)', () => {
  const orig = (u: string) => upgradeToOriginal(u).original;

  it('Giphy: swaps a downsized .gif rendition to the full giphy.gif', () => {
    // Renditions are the last path segment; giphy.gif is the full GIF. Bare host
    // works. Live-verified: media.giphy.com/media/EBaCc5MjS9xu/giphy.gif = 200.
    expect(orig('https://media.giphy.com/media/EBaCc5MjS9xu/200w.gif'))
      .toBe('https://media.giphy.com/media/EBaCc5MjS9xu/giphy.gif');
    expect(orig('https://media0.giphy.com/media/EBaCc5MjS9xu/giphy-downsized.gif'))
      .toBe('https://media0.giphy.com/media/EBaCc5MjS9xu/giphy.gif');
    // the optional /v1.<cid>/ tracking segment is preserved
    expect(orig('https://media2.giphy.com/media/v1.Y2lkPTc5MGI3/EBaCc5MjS9xu/giphy_s.gif'))
      .toBe('https://media2.giphy.com/media/v1.Y2lkPTc5MGI3/EBaCc5MjS9xu/giphy.gif');
    // already the full gif -> unchanged
    expect(orig('https://media.giphy.com/media/EBaCc5MjS9xu/giphy.gif'))
      .toBe('https://media.giphy.com/media/EBaCc5MjS9xu/giphy.gif');
    // an .mp4/.webp rendition keeps its format (not downgraded to gif)
    expect(orig('https://media.giphy.com/media/EBaCc5MjS9xu/giphy.mp4'))
      .toBe('https://media.giphy.com/media/EBaCc5MjS9xu/giphy.mp4');
  });

  it('Tenor: swaps the trailing 5-char rendition code to AAAAC (largest GIF)', () => {
    // id = 11-char base + 5-char size code; AAAAC = full gif. Two host shapes:
    // bare media. (no /m/) and numbered media[N]. (with /m/) — keep each intact.
    expect(orig('https://media.tenor.com/XfrqyR_-jzIAAAAM/anime-goku.gif'))
      .toBe('https://media.tenor.com/XfrqyR_-jzIAAAAC/anime-goku.gif');
    expect(orig('https://media1.tenor.com/m/dlGgz3LRXEMAAAAd/moving.gif'))
      .toBe('https://media1.tenor.com/m/dlGgz3LRXEMAAAAC/moving.gif');
    // already AAAAC -> unchanged
    expect(orig('https://media.tenor.com/XfrqyR_-jzIAAAAC/anime-goku.gif'))
      .toBe('https://media.tenor.com/XfrqyR_-jzIAAAAC/anime-goku.gif');
    // an .mp4 rendition is left alone (AAAAC is the GIF rendition, not mp4)
    expect(orig('https://media.tenor.com/XfrqyR_-jzIAAAPo/anime-goku.mp4'))
      .toBe('https://media.tenor.com/XfrqyR_-jzIAAAPo/anime-goku.mp4');
  });

  it('Burst by Shopify: strips the resize query to the CC0 original', () => {
    // Live-verified same slug: bare = 3.9 MB full jpeg; ?width=300 = 66 KB.
    expect(orig('https://burst.shopifycdn.com/photos/city-ferris-wheel.jpg?width=1000&format=pjpg&exif=0&iptc=0'))
      .toBe('https://burst.shopifycdn.com/photos/city-ferris-wheel.jpg');
    // a non-/photos/ path on the host is not our rule -> untouched
    expect(orig('https://burst.shopifycdn.com/assets/logo.png?width=50'))
      .toBe('https://burst.shopifycdn.com/assets/logo.png?width=50');
  });

  it('WallpaperCave: /w<N>/ thumb folder -> /wp/ full image (editor content)', () => {
    // Live-verified: /w200/J10CtpB.jpg = 12 KB thumb, /wp/J10CtpB.jpg = 584 KB.
    expect(orig('https://wallpapercave.com/w200/J10CtpB.jpg'))
      .toBe('https://wallpapercave.com/wp/J10CtpB.jpg');
    // the /w/<code> detail *page* (no digits) is not an image -> untouched
    expect(orig('https://wallpapercave.com/w/J10CtpB'))
      .toBe('https://wallpapercave.com/w/J10CtpB');
    // already /wp/ -> unchanged
    expect(orig('https://wallpapercave.com/wp/J10CtpB.jpg'))
      .toBe('https://wallpapercave.com/wp/J10CtpB.jpg');
  });

  it('Wallpapers.com: /images/thumbnail| high/ -> /images/hd/ (largest = og:image)', () => {
    // Verified thumbnail 11 KB -> hd 319 KB (hd is the top; download/original 404).
    expect(orig('https://wallpapers.com/images/thumbnail/4k-nature-landscape-abc.jpg'))
      .toBe('https://wallpapers.com/images/hd/4k-nature-landscape-abc.jpg');
    // the mid `high` size upgrades too, extension preserved (.webp)
    expect(orig('https://wallpapers.com/images/high/4k-nature-landscape-abc.webp'))
      .toBe('https://wallpapers.com/images/hd/4k-nature-landscape-abc.webp');
    // already /hd/ -> unchanged
    expect(orig('https://wallpapers.com/images/hd/4k-nature-landscape-abc.jpg'))
      .toBe('https://wallpapers.com/images/hd/4k-nature-landscape-abc.jpg');
  });

  it('WallpaperAccess: /thumb/<id> -> /full/<id>, but never the /download/ HTML route', () => {
    // Verified /thumb/17520.jpg 32 KB -> /full/17520.jpg 797 KB.
    expect(orig('https://wallpaperaccess.com/thumb/17520.jpg'))
      .toBe('https://wallpaperaccess.com/full/17520.jpg');
    // the /download/<slug>-<id> page route is NOT an image -> untouched
    expect(orig('https://wallpaperaccess.com/download/cool-nature-17520'))
      .toBe('https://wallpaperaccess.com/download/cool-nature-17520');
    // already /full/ -> unchanged
    expect(orig('https://wallpaperaccess.com/full/17520.jpg'))
      .toBe('https://wallpaperaccess.com/full/17520.jpg');
  });
});

describe('image-CDN rule batch (2026-07-16 Tier-1 site-coverage sweep)', () => {
  const orig = (u: string) => upgradeToOriginal(u).original;

  it('Wikimedia: drops /thumb/ + the trailing NNNpx filename to the upload', () => {
    // Live-verified: 330px thumb 24 KB -> original 11.4 MB.
    expect(orig('https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Cat_poster_1.jpg/330px-Cat_poster_1.jpg'))
      .toBe('https://upload.wikimedia.org/wikipedia/commons/0/0b/Cat_poster_1.jpg');
    // works for a local-wiki <lang> project, not just commons
    expect(orig('https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/Example.jpg/250px-Example.jpg'))
      .toBe('https://upload.wikimedia.org/wikipedia/en/a/a9/Example.jpg');
    // PDF/DjVu thumb (lossy-page1-…) still drops to the source document
    expect(orig('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo.pdf/lossy-page1-330px-Foo.pdf.jpg'))
      .toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.pdf');
    // an already-original (no /thumb/) URL is untouched
    expect(orig('https://upload.wikimedia.org/wikipedia/commons/0/0b/Cat_poster_1.jpg'))
      .toBe('https://upload.wikimedia.org/wikipedia/commons/0/0b/Cat_poster_1.jpg');
  });

  it('Weibo: swaps the size-alias segment to /large/', () => {
    // Live-verified (with Referer): mw690 63 KB -> large 143 KB.
    expect(orig('https://wx1.sinaimg.cn/mw690/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg'))
      .toBe('https://wx1.sinaimg.cn/large/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg');
    // ww-host + a different alias (bmiddle)
    expect(orig('https://ww3.sinaimg.cn/bmiddle/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg'))
      .toBe('https://ww3.sinaimg.cn/large/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg');
    // already /large/ -> unchanged; the watermark-free master is left alone
    expect(orig('https://wx1.sinaimg.cn/large/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg'))
      .toBe('https://wx1.sinaimg.cn/large/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg');
    expect(orig('https://wx1.sinaimg.cn/woriginal/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg'))
      .toBe('https://wx1.sinaimg.cn/woriginal/0079MVdAly1fypxnd2tdgj30lb06i3zo.jpg');
  });

  it('Bilibili: strips the @-transform suffix to the base image', () => {
    // Live-verified: @240w thumb 5.7 KB -> base 122 KB.
    expect(orig('https://i0.hdslb.com/bfs/archive/0c447de2e8b43417d2ab1eeb75ea897f1e3f22fb.jpg@240w_150h_1c.webp'))
      .toBe('https://i0.hdslb.com/bfs/archive/0c447de2e8b43417d2ab1eeb75ea897f1e3f22fb.jpg');
    // *.biliimg.com host too
    expect(orig('https://album.biliimg.com/bfs/new_dyn/abc123.png@1e_1c.webp'))
      .toBe('https://album.biliimg.com/bfs/new_dyn/abc123.png');
    // no @-suffix -> unchanged
    expect(orig('https://i2.hdslb.com/bfs/archive/0c447de2e8b43417d2ab1eeb75ea897f1e3f22fb.jpg'))
      .toBe('https://i2.hdslb.com/bfs/archive/0c447de2e8b43417d2ab1eeb75ea897f1e3f22fb.jpg');
  });

  it('Imgbox: thumbs<N> -> images<N> and _t -> _o', () => {
    // Live-verified: _t thumb 6.9 KB -> _o original 61.6 KB.
    expect(orig('https://thumbs2.imgbox.com/e9/ab/R48s5RYk_t.png'))
      .toBe('https://images2.imgbox.com/e9/ab/R48s5RYk_o.png');
    // already the original host -> untouched
    expect(orig('https://images2.imgbox.com/e9/ab/R48s5RYk_o.png'))
      .toBe('https://images2.imgbox.com/e9/ab/R48s5RYk_o.png');
  });

  it('Yandex: swaps the final size alias to /orig', () => {
    // Live-verified: XXL 103 KB -> orig 2.3 MB.
    expect(orig('https://avatars.mds.yandex.net/get-altay/1363250/2a00000163a7b418c2c2ec86d951ae43dd21/XXL'))
      .toBe('https://avatars.mds.yandex.net/get-altay/1363250/2a00000163a7b418c2c2ec86d951ae43dd21/orig');
    // a different namespace + alias (get-mpic/2hq)
    expect(orig('https://avatars.mds.yandex.net/get-mpic/1244413/img_id6063597382562623069.jpeg/2hq'))
      .toBe('https://avatars.mds.yandex.net/get-mpic/1244413/img_id6063597382562623069.jpeg/orig');
    // already /orig -> unchanged
    expect(orig('https://avatars.mds.yandex.net/get-altay/1363250/2a00000163a7b418c2c2ec86d951ae43dd21/orig'))
      .toBe('https://avatars.mds.yandex.net/get-altay/1363250/2a00000163a7b418c2c2ec86d951ae43dd21/orig');
  });

  it('Times of India: rebuilds the msid thumb at native width', () => {
    // Live-verified: width-600 26 KB -> width-20000 (native clamp) 475 KB.
    expect(orig('https://static.toiimg.com/thumb/imgsize-143943,msid-132430727,width-600,resizemode-4/132430727.jpg'))
      .toBe('https://static.toiimg.com/thumb/msid-132430727,width-20000,resizemode-4/132430727.jpg');
    // recovers the id from a /photo/<ID>.cms canonical link too
    expect(orig('https://static.toiimg.com/photo/132430727.cms'))
      .toBe('https://static.toiimg.com/thumb/msid-132430727,width-20000,resizemode-4/132430727.jpg');
  });

  it('Trendyol: strips the /mnresize/<W>/<H>/ prefix to the origin', () => {
    // Live-verified: /mnresize/128/192/ 3.9 KB -> origin 59.7 KB.
    expect(orig('https://cdn.dsmcdn.com/mnresize/128/192/ty204/product/media/images/20211020/17/152943554/198334547/1/1_org_zoom.jpg'))
      .toBe('https://cdn.dsmcdn.com/ty204/product/media/images/20211020/17/152943554/198334547/1/1_org_zoom.jpg');
  });

  it('Youm7: swaps the small/medium size dir to /large/', () => {
    // Live-verified: /small/…_88.jpg 4.6 KB -> /large/…_88.jpg 22 KB.
    expect(orig('https://img.youm7.com/small/202607050134483448_88.jpg'))
      .toBe('https://img.youm7.com/large/202607050134483448_88.jpg');
    expect(orig('https://img.youm7.com/Medium/202302030351455145.jpg'))
      .toBe('https://img.youm7.com/large/202302030351455145.jpg');
    // a content-root directory (not a resizer) is left untouched
    expect(orig('https://img.youm7.com/ArticleImgs/2026/7/5/202607050134483448_88.jpg'))
      .toBe('https://img.youm7.com/ArticleImgs/2026/7/5/202607050134483448_88.jpg');
  });

  it('Globo: widens the Thumbor edge geometry to /0x0/ (native)', () => {
    // Live-verified: /3840x0/ == /0x0/ = 712 KB (embedded origin is a private
    // bucket, so widen the public edge geometry rather than extract it).
    expect(orig('https://s2-g1.glbimg.com/Y-oidhivTyxl9L6W_wM0c38nF8Y=/3840x0/filters:format(jpeg)/https://i.s3.glbimg.com/v1/AUTH_59edd422/internal_photos/bs/2026/frame.jpeg'))
      .toBe('https://s2-g1.glbimg.com/Y-oidhivTyxl9L6W_wM0c38nF8Y=/0x0/filters:format(jpeg)/https://i.s3.glbimg.com/v1/AUTH_59edd422/internal_photos/bs/2026/frame.jpeg');
    // a plain s<N> edge host works too
    expect(orig('https://s2.glbimg.com/abc=/600x0/https://s.glbimg.com/foo/bar.jpg'))
      .toBe('https://s2.glbimg.com/abc=/0x0/https://s.glbimg.com/foo/bar.jpg');
  });

  it('ImgBB: strips the .md/.th size suffix to the original', () => {
    // Verified via direct CDN probe: .md/.th variants + no-suffix original all 200.
    expect(orig('https://i.ibb.co/wSkzRXP/italy.md.png'))
      .toBe('https://i.ibb.co/wSkzRXP/italy.png');
    expect(orig('https://i.ibb.co/wSkzRXP/italy.th.png'))
      .toBe('https://i.ibb.co/wSkzRXP/italy.png');
    // already the no-suffix original -> unchanged
    expect(orig('https://i.ibb.co/wSkzRXP/italy.png'))
      .toBe('https://i.ibb.co/wSkzRXP/italy.png');
  });
});

describe('image-CDN rule batch (2026-07-16 tier-2 sweep 2)', () => {
  const orig = (u: string) => upgradeToOriginal(u).original;

  it('VSCO: strips the ?w=/dpr resize query to the bare master', () => {
    // Browser-verified: displayed = responsiveUrl?w=2048&dpr=1, bare = original.
    expect(orig('https://im.vsco.co/1/51a9887c50f8151/561f648001146426743090fa/vsco_101515.jpg?w=2048&dpr=1'))
      .toBe('https://im.vsco.co/1/51a9887c50f8151/561f648001146426743090fa/vsco_101515.jpg');
    // og:image variant (?w=1200) strips the same
    expect(orig('https://im.vsco.co/1/51a9887c50f8151/561f648001146426743090fa/vsco_101515.jpg?w=1200'))
      .toBe('https://im.vsco.co/1/51a9887c50f8151/561f648001146426743090fa/vsco_101515.jpg');
    // already bare -> unchanged
    expect(orig('https://im.vsco.co/1/51a9887c50f8151/561f648001146426743090fa/vsco_101515.jpg'))
      .toBe('https://im.vsco.co/1/51a9887c50f8151/561f648001146426743090fa/vsco_101515.jpg');
  });

  it('Saatchi Art: swaps the trailing size token to -8 (largest offered)', () => {
    // Verified: -7 46 KB -> -8 237 KB (largest); -22 is an LQIP blur placeholder.
    expect(orig('https://images.saatchiart.com/saatchi/958076/art/9382443/8445551-ISPEBVAO-7.jpg'))
      .toBe('https://images.saatchiart.com/saatchi/958076/art/9382443/8445551-ISPEBVAO-8.jpg');
    expect(orig('https://images.saatchiart.com/saatchi/958076/art/9382443/8445551-ISPEBVAO-22.jpg'))
      .toBe('https://images.saatchiart.com/saatchi/958076/art/9382443/8445551-ISPEBVAO-8.jpg');
    // already -8 -> unchanged
    expect(orig('https://images.saatchiart.com/saatchi/958076/art/9382443/8445551-ISPEBVAO-8.jpg'))
      .toBe('https://images.saatchiart.com/saatchi/958076/art/9382443/8445551-ISPEBVAO-8.jpg');
  });

  it('WEBTOON: strips the ?type=q90 recompress to the panel original', () => {
    // Verified: q90 57 KB -> no-type original 159 KB (type=q100 404s).
    expect(orig('https://webtoon-phinf.pstatic.net/20200328_249/1585334566015rEpaA_JPEG/15853345629669517.jpg?type=q90'))
      .toBe('https://webtoon-phinf.pstatic.net/20200328_249/1585334566015rEpaA_JPEG/15853345629669517.jpg');
    // the swebtoon-phinf variant host too
    expect(orig('https://swebtoon-phinf.pstatic.net/x/y/z.jpg?type=q90'))
      .toBe('https://swebtoon-phinf.pstatic.net/x/y/z.jpg');
    // no type query -> unchanged
    expect(orig('https://webtoon-phinf.pstatic.net/x/y/z.jpg'))
      .toBe('https://webtoon-phinf.pstatic.net/x/y/z.jpg');
  });
});

describe('image-CDN rule batch (2026-07-16 fediverse trio)', () => {
  const orig = (u: string) => upgradeToOriginal(u).original;

  it('Pixelfed: strips _thumb before the ext on the /m/_v2/ media path', () => {
    // Host-agnostic: CDN (pxscdn.com) + self-hosted /storage/, both share /m/_v2/.
    // Verified _thumb 143 KB -> original 345 KB.
    expect(orig('https://pxscdn.com/public/m/_v2/2/0d402c64b/VxFJORg41OVz/dUXg16Id8_thumb.jpg'))
      .toBe('https://pxscdn.com/public/m/_v2/2/0d402c64b/VxFJORg41OVz/dUXg16Id8.jpg');
    expect(orig('https://gram.social/storage/m/_v2/2/0d402c64b/VxFJORg41OVz/abc_thumb.jpeg'))
      .toBe('https://gram.social/storage/m/_v2/2/0d402c64b/VxFJORg41OVz/abc.jpeg');
    // already the bare original -> unchanged
    expect(orig('https://pxscdn.com/public/m/_v2/2/0d402c64b/VxFJORg41OVz/dUXg16Id8.jpg'))
      .toBe('https://pxscdn.com/public/m/_v2/2/0d402c64b/VxFJORg41OVz/dUXg16Id8.jpg');
    // a _thumb OUTSIDE a Pixelfed /m/_v2/ path is left alone (no false positive)
    expect(orig('https://example.com/images/photo_thumb.jpg'))
      .toBe('https://example.com/images/photo_thumb.jpg');
  });

  it('Lemmy/pict-rs: strips ?thumbnail/?format to the stored original', () => {
    // Verified: pict-rs honours the params (thumbnail=256 = 11 KB); bare = 577 KB.
    expect(orig('https://lemmy.world/pictrs/image/abc.jpeg?thumbnail=256&format=webp'))
      .toBe('https://lemmy.world/pictrs/image/abc.jpeg');
    expect(orig('https://lemmy.ml/pictrs/image/xyz.png?format=webp'))
      .toBe('https://lemmy.ml/pictrs/image/xyz.png');
    // a bare pict-rs original (no params) -> unchanged (the post.url free-ride)
    expect(orig('https://lemmy.world/pictrs/image/abc.jpeg'))
      .toBe('https://lemmy.world/pictrs/image/abc.jpeg');
  });
});

describe('image-CDN rule batch (2026-07-16 Tier-1 sweep batch 2)', () => {
  const orig = (u: string) => upgradeToOriginal(u).original;

  it('Shopee: strips the _tn / @resize suffix on the /file/<hash> key', () => {
    // Verified _tn 13 KB / @resize_w450 21 KB -> bare key 91 KB.
    expect(orig('https://down-ph.img.susercontent.com/file/e61202f302fdc0b4b0989f98d7d30f6d_tn'))
      .toBe('https://down-ph.img.susercontent.com/file/e61202f302fdc0b4b0989f98d7d30f6d');
    expect(orig('https://down-my.img.susercontent.com/file/e61202f302fdc0b4b0989f98d7d30f6d@resize_w450_nl'))
      .toBe('https://down-my.img.susercontent.com/file/e61202f302fdc0b4b0989f98d7d30f6d');
    // already the bare key -> unchanged
    expect(orig('https://down-ph.img.susercontent.com/file/e61202f302fdc0b4b0989f98d7d30f6d'))
      .toBe('https://down-ph.img.susercontent.com/file/e61202f302fdc0b4b0989f98d7d30f6d');
  });

  it('Mercado Libre: rewrites any size code to -F.jpg (Full, largest)', () => {
    // Verified -AB.webp 21 KB -> -F.jpg 211 KB.
    expect(orig('https://http2.mlstatic.com/D_Q_NP_2X_602300-MLA110125772377_042026-AB.webp'))
      .toBe('https://http2.mlstatic.com/D_Q_NP_2X_602300-MLA110125772377_042026-F.jpg');
    expect(orig('https://http2.mlstatic.com/D_NQ_NP_602300-MLA110125772377_042026-O.jpg'))
      .toBe('https://http2.mlstatic.com/D_NQ_NP_602300-MLA110125772377_042026-F.jpg');
  });

  it('Tokopedia: removes the /img/cache/<size>/ resizer segment', () => {
    // Verified 500-square 42 KB -> 621 KB.
    expect(orig('https://images.tokopedia.net/img/cache/500-square/VqbcmM/2024/3/2/7d9f.png'))
      .toBe('https://images.tokopedia.net/img/VqbcmM/2024/3/2/7d9f.png');
    // no cache segment -> unchanged
    expect(orig('https://images.tokopedia.net/img/VqbcmM/2024/3/2/7d9f.png'))
      .toBe('https://images.tokopedia.net/img/VqbcmM/2024/3/2/7d9f.png');
  });

  it('Hepsiburada: pins the /s/<store>/<SIZE>/ segment to 2000 (max)', () => {
    // Verified 550 17 KB -> 2000 86 KB.
    expect(orig('https://productimages.hepsiburada.net/s/236/550/110000219876712.jpg'))
      .toBe('https://productimages.hepsiburada.net/s/236/2000/110000219876712.jpg');
    // a WxH size segment is also replaced by the max width
    expect(orig('https://productimages.hepsiburada.net/s/236/300-443/110000219876712.jpg'))
      .toBe('https://productimages.hepsiburada.net/s/236/2000/110000219876712.jpg');
  });

  it('Leboncoin: rewrites ?rule=<size> to ad-large', () => {
    // Verified ad-thumb 8 KB -> ad-large 263 KB.
    expect(orig('https://img.leboncoin.fr/api/v1/lbcpb1/images/c6/48/c648f4ff.jpg?rule=ad-thumb'))
      .toBe('https://img.leboncoin.fr/api/v1/lbcpb1/images/c6/48/c648f4ff.jpg?rule=ad-large');
  });

  it('Meesho: bumps ?width to the native cap (2000)', () => {
    // Verified width=512 58 KB -> width=2000 122 KB (native).
    expect(orig('https://images.meesho.com/images/products/607773583/d5ijr_512.webp?width=512'))
      .toBe('https://images.meesho.com/images/products/607773583/d5ijr_512.webp?width=2000');
  });

  it('Domestika: drops the imgproxy processing opts (unsigned /unsafe/)', () => {
    // Verified w:650 30 KB -> 161 KB.
    expect(orig('https://imgproxy.domestika.org/unsafe/w:650/dpr:1/rs:fill/plain/src://course-covers/000/005/642/5642-original.jpg'))
      .toBe('https://imgproxy.domestika.org/unsafe/plain/src://course-covers/000/005/642/5642-original.jpg');
    // already clean (/unsafe/plain/) -> unchanged (no double-strip)
    expect(orig('https://imgproxy.domestika.org/unsafe/plain/src://course-covers/000/005/642/5642-original.jpg'))
      .toBe('https://imgproxy.domestika.org/unsafe/plain/src://course-covers/000/005/642/5642-original.jpg');
  });

  it('Sahibinden: pins the /photos/ filename prefix to x5_ (largest)', () => {
    // Verified thmb_ 6 KB / bare 56 KB -> x5_ 65 KB.
    expect(orig('https://i0.shbdn.com/photos/09/70/02/thmb_1274097002ixv.jpg'))
      .toBe('https://i0.shbdn.com/photos/09/70/02/x5_1274097002ixv.jpg');
    // no prefix -> x5_ inserted
    expect(orig('https://i0.shbdn.com/photos/09/70/02/1274097002ixv.jpg'))
      .toBe('https://i0.shbdn.com/photos/09/70/02/x5_1274097002ixv.jpg');
  });

  it('Wattpad: pins the cover width token to 512 (max)', () => {
    // Verified 256 23 KB -> 512 77 KB.
    expect(orig('https://img.wattpad.com/cover/191584019-256-k170402.jpg'))
      .toBe('https://img.wattpad.com/cover/191584019-512-k170402.jpg');
  });

  it('Naver Blog: bumps ?type=w<N> to w3840 (does NOT strip -> placeholder)', () => {
    // Verified type=w773 93 KB -> w3840 315 KB (native).
    expect(orig('https://postfiles.pstatic.net/MjAy/abc.JPEG.ecopassport/name.jpg?type=w773'))
      .toBe('https://postfiles.pstatic.net/MjAy/abc.JPEG.ecopassport/name.jpg?type=w3840');
    expect(orig('https://mblogthumb-phinf.pstatic.net/MjAy/abc.jpg?type=w800'))
      .toBe('https://mblogthumb-phinf.pstatic.net/MjAy/abc.jpg?type=w3840');
  });

  it('Lofter: strips the entire NetEase NOS processing query', () => {
    // Verified 77 KB -> 209 KB.
    expect(orig('https://imglf5.lf127.net/img/52be31cc369db74d/abc.jpg?imageView&thumbnail=500x0&quality=96'))
      .toBe('https://imglf5.lf127.net/img/52be31cc369db74d/abc.jpg');
    // bare URL (no query) -> unchanged
    expect(orig('https://imglf5.lf127.net/img/52be31cc369db74d/abc.jpg'))
      .toBe('https://imglf5.lf127.net/img/52be31cc369db74d/abc.jpg');
  });

  it('nostr.build: strips /thumb/ and /resp/<size>/ to the bare hash original', () => {
    // Verified /thumb/ 9 KB -> bare 82 KB.
    expect(orig('https://image.nostr.build/thumb/0746072cb145f1.jpg'))
      .toBe('https://image.nostr.build/0746072cb145f1.jpg');
    expect(orig('https://image.nostr.build/resp/240p/0746072cb145f1.jpg'))
      .toBe('https://image.nostr.build/0746072cb145f1.jpg');
    // bare hash URL (what clients embed) -> unchanged (free-ride)
    expect(orig('https://image.nostr.build/0746072cb145f1.jpg'))
      .toBe('https://image.nostr.build/0746072cb145f1.jpg');
  });
});
