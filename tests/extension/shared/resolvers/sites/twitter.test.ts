import { twitterResolver, twitterGifCandidate, twitterVideoPending } from '@/extension/shared/resolvers/sites/twitter';

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
  it('a spoofed format falls back to jpg (never echoed into url or ext)', () => {
    const r = one('https://pbs.twimg.com/media/ABC?format=phtml&name=orig');
    expect(r.url).toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=orig');
    expect(r.ext).toBe('jpg');
  });
  it('a spoofed path extension falls back to jpg', () => {
    expect(one('https://pbs.twimg.com/media/ABC.svg').ext).toBe('jpg');
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
  it('card_img with a name param -> name=orig, keeps thumbnail = input', () => {
    const input = 'https://pbs.twimg.com/card_img/908519/W3sImage?format=jpg&name=800x320';
    const c = one(input);
    expect(c.url).toBe('https://pbs.twimg.com/card_img/908519/W3sImage?format=jpg&name=orig');
    expect(c).toMatchObject({ kind: 'image', thumbnailSrc: input });
  });
  it('card_img with no name param is returned unchanged (nothing to upgrade past)', () => {
    const input = 'https://pbs.twimg.com/card_img/908519/W3sImage?format=jpg';
    const c = one(input);
    expect(c.url).toBe(input);
    expect(c).toMatchObject({ kind: 'image', thumbnailSrc: input });
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
  it('returns null for a GIF poster (handled by twitterGifCandidate), or a hint-less pending video when no statusId is found', () => {
    document.body.innerHTML = `<video poster="https://pbs.twimg.com/tweet_video_thumb/XYZ.jpg"></video>`;
    expect(twitterVideoPending(document.querySelector('video')!)).toBeNull();
    document.body.innerHTML = `<video poster="https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg"></video>`;
    const cand = twitterVideoPending(document.querySelector('video')!); // no /status/ link
    expect(cand).toMatchObject({ kind: 'video', unresolvedVideo: true });
    expect(cand?.resolveHint).toBeUndefined();
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

describe('twitter status-id page-URL fallback', () => {
  it('resolve(): uses the page URL status id when no nearby /status/ link exists', () => {
    const img = document.createElement('img');
    const [cand] = twitterResolver.resolve(
      new URL('https://pbs.twimg.com/ext_tw_video_thumb/999/pu/img/x.jpg'),
      { el: img, allowNetwork: false, pageUrl: 'https://x.com/u/status/12345' },
    );
    expect(cand).toMatchObject({
      kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '12345' },
    });
  });

  it('twitterVideoPending(): falls back to the page URL id', () => {
    const v = document.createElement('video');
    v.setAttribute('poster', 'https://pbs.twimg.com/amplify_video_thumb/777/img/y.jpg');
    expect(twitterVideoPending(v, 'https://x.com/u/status/555')).toMatchObject({
      kind: 'video', unresolvedVideo: true, resolveHint: { platform: 'twitter', id: '555' },
    });
  });

  it('twitterVideoPending(): returns a pending video WITHOUT a hint (not null) when no id is found', () => {
    const v = document.createElement('video');
    v.setAttribute('poster', 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/z.jpg');
    const cand = twitterVideoPending(v);
    expect(cand).toMatchObject({ kind: 'video', unresolvedVideo: true, poster: expect.stringContaining('ext_tw_video_thumb') });
    expect(cand?.resolveHint).toBeUndefined();
  });

  it('twitterVideoPending(): a nearby article /status/ link wins over the page URL', () => {
    const art = document.createElement('article');
    art.innerHTML = '<a href="/u/status/111"></a><video poster="https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/z.jpg"></video>';
    const v = art.querySelector('video') as HTMLVideoElement;
    expect(twitterVideoPending(v, 'https://x.com/u/status/999')?.resolveHint?.id).toBe('111');
  });

  it('twitterVideoPending(): prefers the tweet\'s own timestamp permalink over a quoted tweet link', () => {
    // A quoted tweet's link appears in the same article; the main tweet's id is the
    // one wrapping the <time> timestamp. Must resolve the MAIN tweet, not the quote.
    const art = document.createElement('article');
    art.innerHTML =
      '<a href="/quoted/status/222">quoted</a>' +
      '<a href="/main/status/111"><time>now</time></a>' +
      '<video poster="https://pbs.twimg.com/amplify_video_thumb/1/pu/img/z.jpg"></video>';
    const v = art.querySelector('video') as HTMLVideoElement;
    expect(twitterVideoPending(v)?.resolveHint?.id).toBe('111');
  });

  it('twitterVideoPending(): falls back to a /photo|/video media permalink when there is no <time>', () => {
    const art = document.createElement('article');
    art.innerHTML =
      '<a href="/quoted/status/222">quoted</a>' +
      '<a href="/main/status/111/video/1">media</a>' +
      '<video poster="https://pbs.twimg.com/amplify_video_thumb/1/pu/img/z.jpg"></video>';
    const v = art.querySelector('video') as HTMLVideoElement;
    expect(twitterVideoPending(v)?.resolveHint?.id).toBe('111');
  });

  it('twitterVideoPending(): returns null for a GIF poster (handled elsewhere)', () => {
    const v = document.createElement('video');
    v.setAttribute('poster', 'https://pbs.twimg.com/tweet_video_thumb/ABC.jpg');
    expect(twitterVideoPending(v)).toBeNull();
  });
});
