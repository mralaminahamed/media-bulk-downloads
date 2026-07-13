import { dailymotionVideoId } from '@mbd/core/resolvers/sites/dailymotion';

describe('dailymotionVideoId', () => {
  it.each([
    ['watch URL', 'https://www.dailymotion.com/video/x8pp4d0', 'x8pp4d0'],
    ['watch URL with slug', 'https://www.dailymotion.com/video/x8pp4d0_my-title', 'x8pp4d0'],
    ['bare host watch', 'https://dailymotion.com/video/x8pp4d0', 'x8pp4d0'],
    ['embed URL', 'https://www.dailymotion.com/embed/video/x8pp4d0', 'x8pp4d0'],
    ['short link', 'https://dai.ly/x8pp4d0', 'x8pp4d0'],
    ['short link with slug', 'https://dai.ly/x8pp4d0_clip', 'x8pp4d0'],
    ['geo player embed', 'https://geo.dailymotion.com/player.html?video=x8pp4d0', 'x8pp4d0'],
    ['geo player with extra params', 'https://geo.dailymotion.com/player/xabcd.html?video=x8pp4d0&mute=1', 'x8pp4d0'],
  ])('extracts the id from a %s', (_label, url, id) => {
    expect(dailymotionVideoId(url)).toBe(id);
  });

  it.each([
    ['a channel page', 'https://www.dailymotion.com/channelname'],
    ['the home page', 'https://www.dailymotion.com/'],
    ['a non-Dailymotion host', 'https://notdailymotion.com/video/x8pp4d0'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(dailymotionVideoId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(dailymotionVideoId(new URL('https://www.dailymotion.com/video/x8pp4d0'))).toBe('x8pp4d0');
  });
});
