import { twitchClipId } from '@mbd/core/resolvers/sites/twitch';

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
