import {
  deproxy,
  detectType,
  looksLikeMediaUrl,
  parseUrlDimensions,
  upgradeToOriginal,
} from '@/extension/shared/collection/imageUrl';

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
