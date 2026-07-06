import { youtubeResolver, youtubeVideoId } from '@/extension/shared/resolvers/youtube';

const ID = 'dQw4w9WgXcQ'; // 11 chars
const HQ = `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`;
const MQ = `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`;

describe('youtubeVideoId', () => {
  it.each([
    ['watch?v=', `https://www.youtube.com/watch?v=${ID}`],
    ['watch?v= with extra params', `https://www.youtube.com/watch?v=${ID}&list=PL123&t=42s`],
    ['youtu.be short link', `https://youtu.be/${ID}`],
    ['youtu.be with timestamp', `https://youtu.be/${ID}?t=42`],
    ['/embed/', `https://www.youtube.com/embed/${ID}`],
    ['/embed/ with params', `https://www.youtube.com/embed/${ID}?autoplay=1`],
    ['/shorts/', `https://www.youtube.com/shorts/${ID}`],
    ['/live/', `https://www.youtube.com/live/${ID}`],
    ['/v/', `https://www.youtube.com/v/${ID}`],
    ['/e/', `https://www.youtube.com/e/${ID}`],
    ['m.youtube.com', `https://m.youtube.com/watch?v=${ID}`],
    ['music.youtube.com', `https://music.youtube.com/watch?v=${ID}`],
    ['youtube-nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['no scheme (relative to baseURI)', `//www.youtube.com/watch?v=${ID}`],
  ])('extracts the id from %s', (_label, url) => {
    expect(youtubeVideoId(url)).toBe(ID);
  });

  it.each([
    ['a playlist with no video', 'https://www.youtube.com/playlist?list=PL123'],
    ['a channel page', 'https://www.youtube.com/@somechannel'],
    ['the feed', 'https://www.youtube.com/feed/subscriptions'],
    ['a non-YouTube host', `https://vimeo.com/watch?v=${ID}`],
    ['the i.ytimg thumbnail CDN (stays with generic)', `https://i.ytimg.com/vi/${ID}/default.jpg`],
    ['an id that is too short', 'https://www.youtube.com/watch?v=abc'],
    ['an id with an illegal char', 'https://www.youtube.com/watch?v=dQw4w9WgX!Q'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });

  it('accepts a URL object as well as a string', () => {
    expect(youtubeVideoId(new URL(`https://youtu.be/${ID}`))).toBe(ID);
  });
});

describe('youtubeResolver', () => {
  it('matches a watch URL and resolves to the guaranteed hqdefault poster', () => {
    const u = new URL(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeResolver.match(u, { allowNetwork: false })).toBe(true);
    expect(youtubeResolver.resolve(u, { allowNetwork: false })).toEqual([
      { url: HQ, kind: 'image', ext: 'jpg', thumbnailSrc: MQ },
    ]);
  });

  it('does not match the i.ytimg thumbnail CDN (generic resolver owns that)', () => {
    const u = new URL(`https://i.ytimg.com/vi/${ID}/default.jpg`);
    expect(youtubeResolver.match(u, { allowNetwork: false })).toBe(false);
  });

  it('does not match a non-video YouTube page', () => {
    const u = new URL('https://www.youtube.com/playlist?list=PL123');
    expect(youtubeResolver.match(u, { allowNetwork: false })).toBe(false);
  });

  it('collapses every URL shape for one video to the same poster (dedupes across embed + link)', () => {
    const fromEmbed = youtubeResolver.resolve(new URL(`https://www.youtube-nocookie.com/embed/${ID}`), { allowNetwork: false });
    const fromShort = youtubeResolver.resolve(new URL(`https://youtu.be/${ID}`), { allowNetwork: false });
    expect(fromEmbed[0].url).toBe(HQ);
    expect(fromShort[0].url).toBe(HQ);
  });
});
