import { twitterResolver, twitterGifCandidate, twitterVideoPending } from '@/extension/shared/resolvers/twitter';

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

describe('twitterVideoPending', () => {
  it('emits a pending video with statusId hint from an ext_tw_video_thumb poster', () => {
    document.body.innerHTML =
      `<article><a href="/user/status/1799999999999999999"></a>
       <video poster="https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg" src="blob:https://x.com/a"></video></article>`;
    const v = document.querySelector('video')!;
    expect(twitterVideoPending(v)).toEqual({
      url: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg',
      kind: 'video', ext: 'mp4',
      poster: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg',
      resolveHint: { platform: 'twitter', id: '1799999999999999999' },
      unresolvedVideo: true,
    });
  });
  it('returns null for a GIF poster (handled by twitterGifCandidate) or when no statusId is found', () => {
    document.body.innerHTML = `<video poster="https://pbs.twimg.com/tweet_video_thumb/XYZ.jpg"></video>`;
    expect(twitterVideoPending(document.querySelector('video')!)).toBeNull();
    document.body.innerHTML = `<video poster="https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg"></video>`;
    expect(twitterVideoPending(document.querySelector('video')!)).toBeNull(); // no /status/ link
  });
});

describe('twitterResolver — video posters rendered as <img>', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('ext_tw_video_thumb <img> in a status-linked cell -> pending video with statusId', () => {
    document.body.innerHTML =
      `<a href="/u/status/1799"><img src="https://pbs.twimg.com/ext_tw_video_thumb/2040/pu/img/x.jpg"></a>`;
    const img = document.querySelector('img')!;
    const [c] = twitterResolver.resolve(new URL(img.getAttribute('src')!), { el: img, allowNetwork: false });
    expect(c).toMatchObject({
      kind: 'video', ext: 'mp4', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '1799' },
    });
  });

  it('tweet_video_thumb <img> -> direct gif mp4', () => {
    const [c] = twitterResolver.resolve(new URL('https://pbs.twimg.com/tweet_video_thumb/GID.jpg'), { allowNetwork: false });
    expect(c).toEqual({
      url: 'https://video.twimg.com/tweet_video/GID.mp4', kind: 'gif', ext: 'mp4',
      poster: 'https://pbs.twimg.com/tweet_video_thumb/GID.jpg',
    });
  });

  it('extensionless tweet_video_thumb <img> (format in query) -> gif mp4, never a still image', () => {
    // X serves GIF thumbs as /tweet_video_thumb/<ID>?format=jpg with NO path extension.
    const src = 'https://pbs.twimg.com/tweet_video_thumb/HJ_SQ1hWIAAcv77?format=jpg&name=small';
    const [c] = twitterResolver.resolve(new URL(src), { allowNetwork: false });
    expect(c).toEqual({
      url: 'https://video.twimg.com/tweet_video/HJ_SQ1hWIAAcv77.mp4', kind: 'gif', ext: 'mp4', poster: src,
    });
  });

  it('ext_tw_video_thumb <img> with no status link -> hint-less pending video (never an image)', () => {
    document.body.innerHTML = `<img src="https://pbs.twimg.com/ext_tw_video_thumb/2040/pu/img/x.jpg">`;
    const img = document.querySelector('img')!;
    const [c] = twitterResolver.resolve(new URL(img.getAttribute('src')!), { el: img, allowNetwork: false });
    expect(c).toMatchObject({ kind: 'video', unresolvedVideo: true });
    expect(c.resolveHint).toBeUndefined();
  });
});
