import { twitterResolver, twitterGifCandidate } from '@/extension/shared/resolvers/twitter';

const ctx = { allowNetwork: false };
const u = (s: string) => new URL(s);
const one = (s: string) => twitterResolver.resolve(u(s), ctx)[0];

describe('twitterResolver — images', () => {
  it('media size -> name=orig, keeps format', () => {
    expect(one('https://pbs.twimg.com/media/ABC?format=jpg&name=small').url)
      .toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=orig');
  });
  it('no name param -> adds name=orig', () => {
    expect(one('https://pbs.twimg.com/media/ABC?format=png').url)
      .toBe('https://pbs.twimg.com/media/ABC?format=png&name=orig');
  });
  it('legacy .ext:size -> query form name=orig', () => {
    const r = one('https://pbs.twimg.com/media/ABC.jpg:large');
    expect(r.url).toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=orig');
  });
  it('format=webp downgraded to jpg', () => {
    expect(one('https://pbs.twimg.com/media/ABC?format=webp&name=medium').url)
      .toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=orig');
  });
  it('avatar strips size modifier', () => {
    expect(one('https://pbs.twimg.com/profile_images/1/avatar_400x400.jpg').url)
      .toBe('https://pbs.twimg.com/profile_images/1/avatar.jpg');
    expect(one('https://pbs.twimg.com/profile_images/1/avatar_normal.png').url)
      .toBe('https://pbs.twimg.com/profile_images/1/avatar.png');
  });
  it('banner strips trailing size', () => {
    expect(one('https://pbs.twimg.com/profile_banners/1/1600/1500x500').url)
      .toBe('https://pbs.twimg.com/profile_banners/1/1600');
  });
  it('returns [] for non-media twimg paths', () => {
    expect(twitterResolver.resolve(u('https://pbs.twimg.com/semantic_core_img/1/x.jpg'), ctx)).toEqual([]);
  });
});

describe('twitterGifCandidate', () => {
  it('reconstructs the mp4 from a GIF video poster', () => {
    const v = document.createElement('video');
    v.setAttribute('poster', 'https://pbs.twimg.com/tweet_video_thumb/XYZ.jpg');
    expect(twitterGifCandidate(v)).toEqual({
      url: 'https://video.twimg.com/tweet_video/XYZ.mp4', kind: 'gif', ext: 'mp4',
      poster: 'https://pbs.twimg.com/tweet_video_thumb/XYZ.jpg',
    });
  });
  it('returns null for a non-GIF video', () => {
    const v = document.createElement('video');
    v.setAttribute('poster', 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg');
    expect(twitterGifCandidate(v)).toBeNull();
  });
});
