import { mediaIdFromPoster, pinTwimgUrl, bestMp4, bestHls, extractVideoPairs } from '@/extension/shared/resolvers/sniffers/x-media-sniff';

describe('mediaIdFromPoster', () => {
  it('reads the media id from amplify / ext / gif posters', () => {
    expect(mediaIdFromPoster('https://pbs.twimg.com/amplify_video_thumb/2073829265800572928/img/x.jpg')).toBe('2073829265800572928');
    expect(mediaIdFromPoster('https://pbs.twimg.com/ext_tw_video_thumb/1799/pu/img/y.jpg')).toBe('1799');
    expect(mediaIdFromPoster('https://pbs.twimg.com/tweet_video_thumb/ABC.jpg')).toBeNull(); // gif thumb id is not numeric
  });
  it('returns null for a non-video url', () => {
    expect(mediaIdFromPoster('https://pbs.twimg.com/media/ABC?format=jpg')).toBeNull();
  });
});

describe('pinTwimgUrl', () => {
  it('accepts https twimg.com hosts only', () => {
    expect(pinTwimgUrl('https://video.twimg.com/amplify_video/1/vid/avc1/720x1280/a.mp4')).toBe('https://video.twimg.com/amplify_video/1/vid/avc1/720x1280/a.mp4');
    expect(pinTwimgUrl('https://twimg.com/x.mp4')).toBe('https://twimg.com/x.mp4');
  });
  it('rejects other hosts, http, and non-strings', () => {
    expect(pinTwimgUrl('https://evil.com/x.mp4')).toBeNull();
    expect(pinTwimgUrl('http://video.twimg.com/x.mp4')).toBeNull();
    expect(pinTwimgUrl('https://nottwimg.com.evil.com/x.mp4')).toBeNull();
    expect(pinTwimgUrl(42)).toBeNull();
    expect(pinTwimgUrl(undefined)).toBeNull();
  });
  it('returns null (never throws) for a string the URL constructor rejects', () => {
    // Untrusted API JSON: a malformed string makes `new URL()` throw; the catch returns null.
    expect(pinTwimgUrl('not a url')).toBeNull();
    expect(pinTwimgUrl('https://')).toBeNull();
  });
});

describe('bestMp4', () => {
  const variants = [
    { bitrate: 632000, content_type: 'video/mp4', url: 'https://video.twimg.com/a/480.mp4' },
    { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/a/pl.m3u8' },
    { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/a/720.mp4' },
    { bitrate: 950000, content_type: 'video/mp4', url: 'https://video.twimg.com/a/540.mp4' },
  ];
  it('picks the highest-bitrate mp4 and ignores m3u8', () => {
    expect(bestMp4(variants)).toBe('https://video.twimg.com/a/720.mp4');
  });
  it('rejects an mp4 on a non-twimg host', () => {
    expect(bestMp4([{ bitrate: 9, content_type: 'video/mp4', url: 'https://evil.com/x.mp4' }])).toBeNull();
  });
  it('returns null for empty / non-array / mp4-less input', () => {
    expect(bestMp4([])).toBeNull();
    expect(bestMp4(null)).toBeNull();
    expect(bestMp4([{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/a/pl.m3u8' }])).toBeNull();
  });
});

describe('bestHls', () => {
  it('returns the x-mpegURL variant URL (twimg-pinned)', () => {
    const variants = [
      { content_type: 'video/mp4', bitrate: 5, url: 'https://video.twimg.com/a/720.mp4' },
      { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/a/pl.m3u8' },
    ];
    expect(bestHls(variants)).toBe('https://video.twimg.com/a/pl.m3u8');
  });
  it('rejects an x-mpegURL master on a non-twimg host', () => {
    expect(bestHls([{ content_type: 'application/x-mpegURL', url: 'https://evil.com/x.m3u8' }])).toBeNull();
  });
  it('returns null when there is no x-mpegURL variant', () => {
    expect(bestHls([{ content_type: 'video/mp4', url: 'https://video.twimg.com/a/720.mp4' }])).toBeNull();
    expect(bestHls([])).toBeNull();
    expect(bestHls(null)).toBeNull();
  });
});

describe('extractVideoPairs', () => {
  it('extracts [mediaId, best-mp4] from a nested timeline-shaped response', () => {
    const json = {
      data: {
        list: [
          {
            content: {
              legacy: {
                extended_entities: {
                  media: [
                    {
                      id_str: '2073829265800572928',
                      media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/2073829265800572928/img/x.jpg',
                      video_info: {
                        variants: [
                          { bitrate: 632000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2073829265800572928/vid/480.mp4' },
                          { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2073829265800572928/vid/720.mp4' },
                          { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/2073829265800572928/pl/x.m3u8' },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    };
    expect(extractVideoPairs(json)).toEqual([['2073829265800572928', { url: 'https://video.twimg.com/amplify_video/2073829265800572928/vid/720.mp4' }]]);
  });

  it('falls back to the media id parsed from media_url_https when id_str is absent', () => {
    const json = {
      media: {
        media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/555/pu/img/y.jpg',
        video_info: { variants: [{ bitrate: 1, content_type: 'video/mp4', url: 'https://video.twimg.com/ext_tw_video/555/vid/a.mp4' }] },
      },
    };
    expect(extractVideoPairs(json)).toEqual([['555', { url: 'https://video.twimg.com/ext_tw_video/555/vid/a.mp4' }]]);
  });

  it('emits an HLS-only media object as { url, hls: true }', () => {
    const json = { data: { m: { id_str: '900',
      video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/900/pl.m3u8' }] } } } };
    expect(extractVideoPairs(json)).toEqual([['900', { url: 'https://video.twimg.com/900/pl.m3u8', hls: true }]]);
  });

  it('prefers mp4 over HLS when a media object has both', () => {
    const json = { data: { m: { id_str: '901', video_info: { variants: [
      { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/901/pl.m3u8' },
      { content_type: 'video/mp4', bitrate: 5, url: 'https://video.twimg.com/901/720.mp4' },
    ] } } } };
    expect(extractVideoPairs(json)).toEqual([['901', { url: 'https://video.twimg.com/901/720.mp4' }]]);
  });

  it('is empty and never throws for responses without video or for junk', () => {
    expect(extractVideoPairs({ data: { user: { name: 'x' } } })).toEqual([]);
    expect(extractVideoPairs(null)).toEqual([]);
    expect(extractVideoPairs('not an object')).toEqual([]);
    expect(extractVideoPairs({ a: { b: { c: {} } } })).toEqual([]);
  });

  it('dedups repeated media ids (first mp4 wins)', () => {
    const media = (mid: string, url: string) => ({ id_str: mid, video_info: { variants: [{ bitrate: 1, content_type: 'video/mp4', url }] } });
    const json = { a: media('1', 'https://video.twimg.com/1a.mp4'), b: media('1', 'https://video.twimg.com/1b.mp4') };
    const pairs = extractVideoPairs(json);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0]).toBe('1');
  });
});
