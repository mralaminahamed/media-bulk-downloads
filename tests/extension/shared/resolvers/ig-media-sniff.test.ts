import { pinIgUrl, bestIgImage, bestIgVideo, shortcodeFromUrl, extFromIgUrl, extractIgMedia } from '@/extension/shared/resolvers/ig-media-sniff';

describe('pinIgUrl', () => {
  it('accepts https cdninstagram / fbcdn hosts only', () => {
    expect(pinIgUrl('https://scontent-del2-3.cdninstagram.com/v/t51/x_n.jpg?oh=1')).toBe(
      'https://scontent-del2-3.cdninstagram.com/v/t51/x_n.jpg?oh=1',
    );
    expect(pinIgUrl('https://scontent.xx.fbcdn.net/v/t1/y_n.jpg')).toBe('https://scontent.xx.fbcdn.net/v/t1/y_n.jpg');
  });
  it('rejects other hosts, http, and non-strings', () => {
    expect(pinIgUrl('https://evil.com/x.jpg')).toBeNull();
    expect(pinIgUrl('http://scontent.cdninstagram.com/x.jpg')).toBeNull();
    expect(pinIgUrl('https://cdninstagram.com.evil.com/x.jpg')).toBeNull();
    expect(pinIgUrl(42)).toBeNull();
    expect(pinIgUrl(undefined)).toBeNull();
  });
});

describe('shortcodeFromUrl', () => {
  it('reads the shortcode from every IG post/reel/tv shape', () => {
    expect(shortcodeFromUrl('https://www.instagram.com/p/DZoHtD1jH9U/?img_index=1')).toBe('DZoHtD1jH9U');
    expect(shortcodeFromUrl('https://www.instagram.com/rashmiix/p/DZoHtD1jH9U/')).toBe('DZoHtD1jH9U');
    expect(shortcodeFromUrl('https://instagram.com/sangeetha_waliketiya/reel/DaYOGlyvZby/')).toBe('DaYOGlyvZby');
    expect(shortcodeFromUrl('/user/tv/ABC-123_x/')).toBe('ABC-123_x');
  });
  it('returns null when there is no post segment', () => {
    expect(shortcodeFromUrl('https://www.instagram.com/sangeetha_waliketiya/')).toBeNull();
    expect(shortcodeFromUrl('https://www.instagram.com/')).toBeNull();
    expect(shortcodeFromUrl('not a url')).toBeNull();
  });
});

describe('extFromIgUrl', () => {
  it('reads the extension from the path, not the stp transform', () => {
    expect(extFromIgUrl('https://x.cdninstagram.com/v/t51/a_n.jpg?stp=dst-jpegr_e35_tt6')).toBe('jpg');
    expect(extFromIgUrl('https://x.cdninstagram.com/o1/v/t2/f2/m86/AQPx.mp4?oh=1')).toBe('mp4');
    expect(extFromIgUrl('https://x.cdninstagram.com/v/t51/a_n.webp')).toBe('webp');
  });
  it('defaults to jpg when the path has no extension', () => {
    expect(extFromIgUrl('https://x.cdninstagram.com/v/t51/a_n')).toBe('jpg');
  });
});

describe('bestIgImage', () => {
  const candidates = [
    { url: 'https://x.cdninstagram.com/a_1440_n.jpg', width: 1440, height: 1440 },
    { url: 'https://x.cdninstagram.com/a_1080_n.jpg', width: 1080, height: 1080 },
    { url: 'https://x.cdninstagram.com/a_150_n.jpg', width: 150, height: 150 },
  ];
  it('picks the largest-width candidate (not relying on array order)', () => {
    expect(bestIgImage([candidates[2], candidates[0], candidates[1]])).toEqual({
      url: 'https://x.cdninstagram.com/a_1440_n.jpg',
      width: 1440,
      height: 1440,
    });
  });
  it('skips candidates on a non-IG host', () => {
    expect(bestIgImage([{ url: 'https://evil.com/huge.jpg', width: 9999, height: 9999 }, candidates[1]])).toEqual({
      url: 'https://x.cdninstagram.com/a_1080_n.jpg',
      width: 1080,
      height: 1080,
    });
  });
  it('returns null for empty / non-array / hostless input', () => {
    expect(bestIgImage([])).toBeNull();
    expect(bestIgImage(null)).toBeNull();
    expect(bestIgImage([{ url: 'https://evil.com/x.jpg', width: 1, height: 1 }])).toBeNull();
  });
});

describe('bestIgVideo', () => {
  const versions = [
    { url: 'https://x.cdninstagram.com/480.mp4', width: 480, height: 852, type: 102 },
    { url: 'https://x.cdninstagram.com/720.mp4', width: 720, height: 1280, type: 101 },
    { url: 'https://x.cdninstagram.com/360.mp4', width: 360, height: 640, type: 103 },
  ];
  it('picks the highest-width mp4, pinned', () => {
    expect(bestIgVideo(versions)).toBe('https://x.cdninstagram.com/720.mp4');
  });
  it('rejects a version on a non-IG host', () => {
    expect(bestIgVideo([{ url: 'https://evil.com/x.mp4', width: 9999, height: 9999 }])).toBeNull();
  });
  it('returns null for empty / non-array input', () => {
    expect(bestIgVideo([])).toBeNull();
    expect(bestIgVideo(null)).toBeNull();
  });
});

describe('extractIgMedia', () => {
  const imageMedia = (code: string, w: number) => ({
    code,
    media_type: 1,
    image_versions2: { candidates: [{ url: `https://x.cdninstagram.com/${code}_${w}_n.jpg`, width: w, height: w }] },
  });

  it('extracts a single image at its largest candidate', () => {
    const out = extractIgMedia({ items: [imageMedia('AAA', 1080)] });
    expect(out).toEqual([
      { code: 'AAA', kind: 'image', url: 'https://x.cdninstagram.com/AAA_1080_n.jpg', ext: 'jpg', width: 1080, height: 1080 },
    ]);
  });

  it('extracts a video with poster, keyed by the post code', () => {
    const out = extractIgMedia({
      code: 'VID',
      media_type: 2,
      image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/VID_poster_n.jpg', width: 720, height: 1280 }] },
      video_versions: [{ url: 'https://x.cdninstagram.com/VID_720.mp4', width: 720, height: 1280, type: 101 }],
    });
    expect(out).toEqual([
      {
        code: 'VID',
        kind: 'video',
        url: 'https://x.cdninstagram.com/VID_720.mp4',
        ext: 'mp4',
        width: 720,
        height: 1280,
        poster: 'https://x.cdninstagram.com/VID_poster_n.jpg',
      },
    ]);
  });

  it('flattens a carousel into one entry per slide, all under the parent code, ignoring the parent cover', () => {
    // Real IG carousel children carry no `code` of their own — they inherit the
    // parent post's shortcode. That inheritance is what this asserts.
    const carousel = {
      code: 'CAR',
      media_type: 8,
      image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/CAR_cover_n.jpg', width: 1440, height: 1440 }] },
      carousel_media: [
        { media_type: 1, image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/CHILD1_1440_n.jpg', width: 1440, height: 1440 }] } },
        {
          media_type: 2,
          image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/CAR_2_poster_n.jpg', width: 1080, height: 1080 }] },
          video_versions: [{ url: 'https://x.cdninstagram.com/CAR_2.mp4', width: 1080, height: 1080, type: 101 }],
        },
      ],
    };
    const out = extractIgMedia(carousel);
    expect(out).toEqual([
      { code: 'CAR', kind: 'image', url: 'https://x.cdninstagram.com/CHILD1_1440_n.jpg', ext: 'jpg', width: 1440, height: 1440 },
      {
        code: 'CAR',
        kind: 'video',
        url: 'https://x.cdninstagram.com/CAR_2.mp4',
        ext: 'mp4',
        width: 1080,
        height: 1080,
        poster: 'https://x.cdninstagram.com/CAR_2_poster_n.jpg',
      },
    ]);
  });

  it('emits a reels-grid clip (media_type 2, cover only, no video_versions) as a pending video', () => {
    const out = extractIgMedia({
      code: 'REEL',
      media_type: 2,
      image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/REEL_cover_n.jpg', width: 640, height: 1136 }] },
    });
    expect(out).toEqual([
      {
        code: 'REEL',
        kind: 'video',
        url: 'https://x.cdninstagram.com/REEL_cover_n.jpg',
        ext: 'mp4',
        poster: 'https://x.cdninstagram.com/REEL_cover_n.jpg',
        pending: true,
        width: 640,
        height: 1136,
      },
    ]);
  });

  it('dedups the same media url reached twice (grid + hydration)', () => {
    const m = imageMedia('DUP', 1080);
    const out = extractIgMedia({ a: m, b: { ...m } });
    expect(out).toHaveLength(1);
  });

  it('skips media that has no code and no inheritable parent code', () => {
    expect(extractIgMedia({ media_type: 1, image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/x_n.jpg', width: 9, height: 9 }] } })).toEqual([]);
  });

  it('is empty and never throws for junk', () => {
    expect(extractIgMedia(null)).toEqual([]);
    expect(extractIgMedia('nope')).toEqual([]);
    expect(extractIgMedia({ a: { b: { c: {} } } })).toEqual([]);
  });
});
