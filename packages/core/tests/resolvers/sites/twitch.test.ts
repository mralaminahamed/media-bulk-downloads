import { twitchClipId, twitchVodId } from '@mbd/core/resolvers/sites/twitch';

describe('twitchClipId', () => {
  it.each([
    ['clips.twitch.tv/<slug>', 'https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage', 'AwkwardHelplessSalamanderSwiftRage'],
    ['clips host with query', 'https://clips.twitch.tv/GoodPluckyEggnog-ab12CD_x?featured=true', 'GoodPluckyEggnog-ab12CD_x'],
    ['channel /clip/ permalink', 'https://www.twitch.tv/somestreamer/clip/AwkwardHelplessSalamanderSwiftRage', 'AwkwardHelplessSalamanderSwiftRage'],
    ['bare twitch.tv channel clip', 'https://twitch.tv/somestreamer/clip/GoodPluckyEggnog-ab12CD_x', 'GoodPluckyEggnog-ab12CD_x'],
    ['mobile host', 'https://m.twitch.tv/somestreamer/clip/AwkwardHelplessSalamanderSwiftRage', 'AwkwardHelplessSalamanderSwiftRage'],
    ['clips embed ?clip=', 'https://clips.twitch.tv/embed?clip=AwkwardHelplessSalamanderSwiftRage&parent=example.com', 'AwkwardHelplessSalamanderSwiftRage'],
    ['player embed ?clip=', 'https://player.twitch.tv/?clip=GoodPluckyEggnog-ab12CD_x&parent=example.com', 'GoodPluckyEggnog-ab12CD_x'],
  ])('extracts the slug from a %s', (_label, url, id) => {
    expect(twitchClipId(url)).toBe(id);
  });

  it.each([
    ['a channel page (live)', 'https://www.twitch.tv/somestreamer'],
    ['a VOD', 'https://www.twitch.tv/videos/1234567890'],
    ['the directory', 'https://www.twitch.tv/directory'],
    ['the clips home', 'https://clips.twitch.tv/'],
    ['a clips embed with no clip param', 'https://clips.twitch.tv/embed?parent=example.com'],
    ['a player embed with no clip param', 'https://player.twitch.tv/?channel=somestreamer&parent=example.com'],
    ['a non-Twitch host', 'https://nottwitch.tv/AwkwardHelplessSalamanderSwiftRage'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(twitchClipId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(twitchClipId(new URL('https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage'))).toBe('AwkwardHelplessSalamanderSwiftRage');
  });
});

describe('twitchVodId', () => {
  it.each([
    ['a /videos/<id> permalink', 'https://www.twitch.tv/videos/1234567890', '1234567890'],
    ['a bare twitch.tv host', 'https://twitch.tv/videos/987654321', '987654321'],
    ['a mobile host', 'https://m.twitch.tv/videos/1234567890', '1234567890'],
    ['a permalink with query', 'https://www.twitch.tv/videos/1234567890?t=1h2m3s', '1234567890'],
    ['a player embed ?video=v<id>', 'https://player.twitch.tv/?video=v1234567890&parent=example.com', '1234567890'],
    ['a player embed ?video=<id>', 'https://player.twitch.tv/?video=987654321&parent=example.com', '987654321'],
  ])('extracts the VOD id from %s', (_label, url, id) => {
    expect(twitchVodId(url)).toBe(id);
  });

  it.each([
    ['a clip', 'https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage'],
    ['a channel /clip/ permalink', 'https://www.twitch.tv/somestreamer/clip/AwkwardHelplessSalamanderSwiftRage'],
    ['a channel page (live)', 'https://www.twitch.tv/somestreamer'],
    ['the directory', 'https://www.twitch.tv/directory'],
    ['a player embed with no video param', 'https://player.twitch.tv/?channel=somestreamer&parent=example.com'],
    ['a non-Twitch host', 'https://nottwitch.tv/videos/1234567890'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(twitchVodId(url)).toBeNull();
  });

  it('does not mistake a clip slug for a VOD, nor a VOD for a clip', () => {
    const vod = 'https://www.twitch.tv/videos/1234567890';
    const clip = 'https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage';
    expect(twitchVodId(vod)).toBe('1234567890');
    expect(twitchClipId(vod)).toBeNull();
    expect(twitchClipId(clip)).toBe('AwkwardHelplessSalamanderSwiftRage');
    expect(twitchVodId(clip)).toBeNull();
  });
});
