import { describe, it, expect } from 'vitest';
import { pinFbUrl, fbidFromUrl, extFromPath, numOr, extractFbMedia } from '@mbd/core/resolvers/sniffers/fb-media-sniff';

describe('pinFbUrl', () => {
  it('accepts https fbcdn / cdninstagram hosts', () => {
    expect(pinFbUrl('https://scontent-lax3-1.xx.fbcdn.net/v/t39/x_n.jpg?oh=a')).toMatch(/fbcdn\.net/);
    expect(pinFbUrl('https://scontent.cdninstagram.com/v/x.mp4')).toMatch(/cdninstagram/);
  });
  it('rejects non-fbcdn hosts, non-https, and non-strings', () => {
    expect(pinFbUrl('https://evil.example.com/x.jpg')).toBeNull();
    expect(pinFbUrl('http://scontent.xx.fbcdn.net/x.jpg')).toBeNull();
    expect(pinFbUrl(42)).toBeNull();
    expect(pinFbUrl('https://notfbcdn.net.evil.com/x.jpg')).toBeNull();
    // Userinfo bypass: `fbcdn.net` is the username, the real host is evil.com.
    expect(pinFbUrl('https://fbcdn.net@evil.com/x.jpg')).toBeNull();
  });
  it('accepts an uppercase host (URL normalizes the hostname to lowercase)', () => {
    expect(pinFbUrl('https://SCONTENT.FBCDN.NET/x.jpg')).toBeTruthy();
  });
});

describe('fbidFromUrl', () => {
  it('parses fbid= / videos / watch / reel forms', () => {
    expect(fbidFromUrl('/photo/?fbid=123&set=a.1')).toBe('123');
    expect(fbidFromUrl('/photo.php?fbid=456')).toBe('456');
    expect(fbidFromUrl('/user/videos/789/')).toBe('789');
    expect(fbidFromUrl('/watch/?v=1011')).toBe('1011');
    expect(fbidFromUrl('/reel/1213')).toBe('1213');
  });
  it('returns null when no id / non-digits', () => {
    expect(fbidFromUrl('/marketplace/')).toBeNull();
    expect(fbidFromUrl('/photo/?fbid=abc')).toBeNull();
    expect(fbidFromUrl(null)).toBeNull();
  });
  it('parses the /photo/<id> and /photos/<id> path forms (grid tile anchors)', () => {
    expect(fbidFromUrl('/natgeo/photos/777/')).toBe('777');
    expect(fbidFromUrl('/photo/888')).toBe('888');
    expect(fbidFromUrl('/some/photos/')).toBeNull(); // no id → null
  });
});

describe('extFromPath', () => {
  it('reads a media extension from the path, else jpg', () => {
    expect(extFromPath('https://x.fbcdn.net/v/t39/a_n.jpg?oh=1')).toBe('jpg');
    expect(extFromPath('https://x.fbcdn.net/v/t39/a_n.mp4')).toBe('mp4');
    expect(extFromPath('https://x.fbcdn.net/v/t39/a_n.svg')).toBe('jpg'); // off-allowlist → default
  });
  it('reads the ext from the path, never the query string', () => {
    // The query is stripped before matching, so an extension smuggled into it
    // cannot spoof (or rescue) the real path extension.
    expect(extFromPath('https://x.fbcdn.net/a.mp4?x=.exe')).toBe('mp4');
    expect(extFromPath('https://x.fbcdn.net/a.exe?x=.mp4')).toBe('jpg');
  });
});

describe('numOr', () => {
  it('passes through a finite positive number', () => {
    expect(numOr(1080)).toBe(1080);
  });
  it('returns undefined for 0, negatives, NaN, and Infinity', () => {
    expect(numOr(0)).toBeUndefined();
    expect(numOr(-5)).toBeUndefined();
    expect(numOr(NaN)).toBeUndefined();
    expect(numOr(Infinity)).toBeUndefined();
  });
  it('returns undefined for non-number inputs', () => {
    expect(numOr('720')).toBeUndefined();
    expect(numOr(null)).toBeUndefined();
    expect(numOr(undefined)).toBeUndefined();
  });
});

describe('extractFbMedia', () => {
  it('picks the largest image per FBID and ignores blurred previews', () => {
    const json = { data: { node: { id: '100', __typename: 'Photo',
      blurred_image: { uri: 'https://x.fbcdn.net/v/blur_n.jpg', width: 20, height: 20 },
      image: { uri: 'https://x.fbcdn.net/v/small_n.jpg', width: 320, height: 240 },
      photo_image: { uri: 'https://x.fbcdn.net/v/orig_n.jpg', width: 2048, height: 1536 } } } };
    const out = extractFbMedia(json).filter((e) => e.fbid === '100' && e.kind === 'image');
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain('orig_n.jpg');
    expect(out[0].width).toBe(2048);
  });

  it('extracts a real mp4 video (HD preferred) with its poster', () => {
    const json = { video: { id: '200', __typename: 'Video',
      playable_url: 'https://x.fbcdn.net/v/sd.mp4',
      playable_url_quality_hd: 'https://x.fbcdn.net/v/hd.mp4',
      preferred_thumbnail: { image: { uri: 'https://x.fbcdn.net/v/cover_n.jpg', width: 640, height: 360 } } } };
    const vids = extractFbMedia(json).filter((e) => e.kind === 'video');
    expect(vids).toHaveLength(1);
    expect(vids[0].url).toContain('hd.mp4');
    expect(vids[0].fbid).toBe('200');
    expect(vids[0].poster).toContain('cover_n.jpg');
  });

  it('drops media with no resolvable ancestor id and rejects non-fbcdn urls', () => {
    const json = { image: { uri: 'https://evil.com/x.jpg', width: 800, height: 600 } };            // bad host
    const json2 = { image: { uri: 'https://x.fbcdn.net/y_n.jpg', width: 800, height: 600 } };      // no id
    expect(extractFbMedia(json)).toHaveLength(0);
    expect(extractFbMedia(json2)).toHaveLength(0);
  });

  it('handles a deeply-nested benign structure without throwing and still yields the leaf', () => {
    // Deep nesting wrapping one owned media leaf. Depth 1000 is ~20-50x realistic
    // FB nesting yet a safe margin below the JS call-stack limit — the walk (like
    // its recursive twin) is depth-bounded by the stack, which the step guard does
    // not extend, so we stay well clear of that separate boundary here.
    const leaf = { id: '9', image: { uri: 'https://x.fbcdn.net/deep_n.jpg', width: 800, height: 600 } };
    let nested: unknown = leaf;
    for (let i = 0; i < 1000; i++) nested = { a: nested };
    const root = { id: '9', wrapper: nested };
    let out: ReturnType<typeof extractFbMedia> = [];
    expect(() => { out = extractFbMedia(root); }).not.toThrow();
    const img = out.find((e) => e.url.includes('deep_n.jpg'));
    expect(img).toBeDefined();
    expect(img?.fbid).toBe('9');
    expect(img?.kind).toBe('image');
  });

  it('is cycle-guarded: a self-referential graph terminates and still yields the leaf', () => {
    // Exercises the nodeSeen guard directly: without it this object/array cycle
    // recurses forever (stack overflow). With it, each node is visited once.
    const root: Record<string, unknown> = { id: '9', image: { uri: 'https://x.fbcdn.net/cyc_n.jpg', width: 800, height: 600 } };
    root.self = root;               // object cycle
    const arr: unknown[] = [root];
    arr.push(arr);                  // array cycle
    root.list = arr;
    let out: ReturnType<typeof extractFbMedia> = [];
    expect(() => { out = extractFbMedia(root); }).not.toThrow();
    const img = out.find((e) => e.url.includes('cyc_n.jpg'));
    expect(img).toBeDefined();
    expect(img?.fbid).toBe('9');
    expect(img?.kind).toBe('image');
  });

  it('extracts a reel video from progressive_url when playable_url is absent', () => {
    const json = { data: { node: { id: '401', __typename: 'Video',
      progressive_url: 'https://x.fbcdn.net/o1/v/t2/f2/reel_401_prog.mp4?oh=a',
      preferred_thumbnail: { image: { uri: 'https://x.fbcdn.net/v/cover_401_n.jpg', width: 640, height: 360 } } } } };
    const vids = extractFbMedia(json).filter((e) => e.kind === 'video');
    expect(vids).toHaveLength(1);
    expect(vids[0].url).toContain('reel_401_prog.mp4');
    expect(vids[0].fbid).toBe('401');
    expect(vids[0].ext).toBe('mp4');
    expect(vids[0].poster).toContain('cover_401_n.jpg');
  });

  it('still prefers playable_url over progressive_url when both are present', () => {
    const json = { video: { id: '402',
      progressive_url: 'https://x.fbcdn.net/o1/v/t2/prog.mp4',
      playable_url: 'https://x.fbcdn.net/v/playable.mp4' } };
    const vids = extractFbMedia(json).filter((e) => e.kind === 'video');
    expect(vids).toHaveLength(1);
    expect(vids[0].url).toContain('playable.mp4');
  });
});

describe('extractFbMedia — UI-chrome rejection (discovery-spike reconciliation)', () => {
  // Live capture on facebook.com photos + photo-viewer surfaces showed the
  // hydration/GraphQL payload is dominated by UI-icon objects that share the
  // exact `{ uri, width, height }` shape as real photos but are 12–72px glyphs
  // (reaction icons, sprite bundles). They inherit an ancestor `id`, so without
  // a size floor they surface as fake downloadable "media". Real photos measured
  // 213×320 up to 2048×1536; icons never exceeded 72×72.

  it('drops small UI-icon nodes even when they carry uri + width + height + an ancestor id', () => {
    // Icons under a NON icon-named key (a numeric sprite id and a generic key),
    // so only the size floor — not a parent-key filter — can reject them.
    const json = { id: '777', __typename: 'CometUIStory',
      '1876411': { uri: 'https://x.fbcdn.net/rsrc/sprite_n.png', width: 20, height: 20, scale: 1 },
      glyph: { uri: 'https://x.fbcdn.net/rsrc/g_n.png', width: 72, height: 72 } };
    expect(extractFbMedia(json).filter((e) => e.kind === 'image')).toHaveLength(0);
  });

  it('excludes an image under an `icon` parent key regardless of size', () => {
    // Named icon keys observed live: primary_icon / secondary_icon /
    // active_secondary_icon / icon. Guards the (rare) icon that clears the floor.
    const json = { id: '778', icon: { uri: 'https://x.fbcdn.net/rsrc/bigicon_n.png', width: 200, height: 200 } };
    expect(extractFbMedia(json).filter((e) => e.kind === 'image')).toHaveLength(0);
  });

  it('keeps the real photo while dropping a sibling reaction icon at the same FBID', () => {
    // Real GraphQL Photo node shape: { __typename:'Photo', id:<18 digits>,
    // image:{ uri, width, height }, ... } with chrome icons alongside.
    const json = { id: '888', __typename: 'Photo',
      image: { uri: 'https://x.fbcdn.net/v/real_n.jpg', width: 960, height: 1280 },
      reaction: { uri: 'https://x.fbcdn.net/rsrc/like_n.png', width: 24, height: 24 } };
    const imgs = extractFbMedia(json).filter((e) => e.kind === 'image');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].url).toContain('real_n.jpg');
    expect(imgs[0].width).toBe(960);
  });

  it('accepts at the floor and rejects just below it', () => {
    const atFloor = { id: '1', image: { uri: 'https://x.fbcdn.net/v/a_n.jpg', width: 128, height: 128 } };
    const belowFloor = { id: '2', image: { uri: 'https://x.fbcdn.net/v/b_n.jpg', width: 127, height: 300 } };
    expect(extractFbMedia(atFloor).filter((e) => e.kind === 'image')).toHaveLength(1);
    expect(extractFbMedia(belowFloor).filter((e) => e.kind === 'image')).toHaveLength(0);
  });

  it('still surfaces the `viewer_image` key seen in profile-photos hydration', () => {
    // Profile-photos hydration keys the full image as `viewer_image` (the
    // GraphQL viewer keys it as `image`); both must resolve.
    const json = { id: '999', __typename: 'Photo',
      viewer_image: { uri: 'https://x.fbcdn.net/v/vi_n.jpg', width: 1366, height: 2048 } };
    const imgs = extractFbMedia(json).filter((e) => e.kind === 'image');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].url).toContain('vi_n.jpg');
  });
});
