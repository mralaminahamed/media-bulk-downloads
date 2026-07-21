import { kickClipId, kickVideoId } from '@mbd/core/resolvers/sites/kick';

describe('kickClipId', () => {
  it.each([
    ['a channel clip permalink', 'https://kick.com/xqc/clips/clip_01HXYZ', 'clip_01HXYZ'],
    ['a top-level /clips/ url', 'https://kick.com/clips/clip_ABC123', 'clip_ABC123'],
    ['a ?clip= embed query', 'https://kick.com/xqc?clip=clip_DEF456', 'clip_DEF456'],
    ['a www subdomain', 'https://www.kick.com/foo/clips/clip_9', 'clip_9'],
  ])('extracts the clip id from %s', (_l, url, want) => {
    expect(kickClipId(url)).toBe(want);
  });

  it('returns null for a non-kick host', () => {
    expect(kickClipId('https://example.com/clips/clip_1')).toBeNull();
  });

  it('returns null for a channel/vod page (no clip id)', () => {
    expect(kickClipId('https://kick.com/xqc')).toBeNull();
    expect(kickClipId('https://kick.com/xqc/videos/5e9a...')).toBeNull();
  });

  it('rejects a malformed clip id', () => {
    expect(kickClipId('https://kick.com/clips/notaclip')).toBeNull();
    expect(kickClipId('https://kick.com/clips/clip_bad!')).toBeNull();
  });
});

describe('kickVideoId', () => {
  const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  it.each([
    ['a /videos/<uuid> permalink', `https://kick.com/xqc/videos/${UUID}`, UUID],
    ['a /video/<uuid> url', `https://kick.com/video/${UUID}`, UUID],
  ])('extracts the video id from %s', (_l, url, want) => {
    expect(kickVideoId(url)).toBe(want);
  });

  it('returns null for a non-kick host', () => {
    expect(kickVideoId(`https://example.com/video/${UUID}`)).toBeNull();
  });

  it('returns null for a non-uuid id', () => {
    expect(kickVideoId('https://kick.com/xqc/videos/12345')).toBeNull();
  });
});
