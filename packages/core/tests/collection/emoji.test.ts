import { isEmojiUrl } from '@mbd/core/collection/emoji';

describe('isEmojiUrl', () => {
  it('flags twemoji served by known CDNs', () => {
    expect(isEmojiUrl('https://abs.twimg.com/emoji/v2/svg/1f9f8.svg')).toBe(true);
    expect(isEmojiUrl('https://s.w.org/images/core/emoji/14.0.0/svg/1f600.svg')).toBe(true);
    expect(isEmojiUrl('https://twemoji.maxcdn.com/v/latest/svg/1f600.svg')).toBe(true);
    expect(isEmojiUrl('https://cdn.jsdelivr.net/gh/twitter/twemoji/assets/svg/1f600.svg')).toBe(true);
    expect(isEmojiUrl('https://github.githubassets.com/images/icons/emoji/unicode/1f600.png')).toBe(true);
  });
  it('flags Facebook / Instagram emoji (the emoji.php renderer)', () => {
    expect(isEmojiUrl('https://static.xx.fbcdn.net/images/emoji.php/v9/z9c/1.0/128/1f40d.png')).toBe(true);
    expect(isEmojiUrl('https://static.xx.fbcdn.net/images/emoji.php/v9/td3/1/32/1f1f9_1f1ff.png')).toBe(true);
    expect(isEmojiUrl('https://www.facebook.com/images/emoji.php/v9/t4c/1/16/1f600.png')).toBe(true);
  });
  it('flags Facebook static UI sprites/glyphs (the rsrc.php resource endpoint)', () => {
    // The reported reaction/emoji sprite — and the rsrc.php class it belongs to.
    expect(isEmojiUrl('https://static.xx.fbcdn.net/rsrc.php/yk/r/5ak_tKfzmQv.webp')).toBe(true);
    expect(isEmojiUrl('https://static.xx.fbcdn.net/rsrc.php/v3/yh/r/abcDEF123.png')).toBe(true);
    expect(isEmojiUrl('https://www.facebook.com/rsrc.php/v3/y8/r/glyph.svg')).toBe(true);
  });
  it('flags emoji packs mirrored on jsdelivr / cdnjs (openmoji, noto, joypixels…)', () => {
    expect(isEmojiUrl('https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji/color/svg/1F600.svg')).toBe(true);
    expect(isEmojiUrl('https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji/png/128/emoji_u1f600.png')).toBe(true);
    expect(isEmojiUrl('https://cdn.jsdelivr.net/npm/emoji-datasource@15/img/apple/64/1f600.png')).toBe(true);
    expect(isEmojiUrl('https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f600.svg')).toBe(true);
    expect(isEmojiUrl('https://cdnjs.cloudflare.com/ajax/libs/joypixels/6.6.0/png/64/1f600.png')).toBe(true);
  });
  it('flags chat / reaction emoji from Slack, Discord, and Twitch', () => {
    expect(isEmojiUrl('https://emoji.slack-edge.com/T01/party-parrot/abc123.gif')).toBe(true);
    expect(isEmojiUrl('https://a.slack-edge.com/production-standard-emoji-assets/14.0/apple-medium/1f600.png')).toBe(true);
    expect(isEmojiUrl('https://cdn.discordapp.com/emojis/123456789012345678.webp')).toBe(true);
    expect(isEmojiUrl('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0')).toBe(true);
  });
  it('flags the Emojipedia, Google Noto, and JoyPixels image CDNs', () => {
    expect(isEmojiUrl('https://em-content.zobj.net/source/apple/391/snake_1f40d.png')).toBe(true);
    expect(isEmojiUrl('https://fonts.gstatic.com/s/e/notoemoji/latest/1f600/512.gif')).toBe(true);
    expect(isEmojiUrl('https://cdn.joypixels.com/emoji/v6/png/64/1f600.png')).toBe(true);
  });
  it('does not flag normal images or unparseable input', () => {
    expect(isEmojiUrl('https://pbs.twimg.com/media/abc.jpg')).toBe(false); // Twitter media, not emoji
    expect(isEmojiUrl('https://example.com/logo.svg')).toBe(false);
    expect(isEmojiUrl('https://example.com/1f600.svg')).toBe(false); // hex name, wrong host
    expect(isEmojiUrl('not a url')).toBe(false);
    expect(isEmojiUrl('https://abs.twimg.com/media/x.jpg')).toBe(false); // twitter, non-emoji path
    expect(isEmojiUrl('https://s.w.org/images/core/other.svg')).toBe(false); // wordpress, non-emoji path
    expect(isEmojiUrl('https://cdn.jsdelivr.net/gh/foo/bar/x.svg')).toBe(false); // jsdelivr, non-twemoji path
    expect(isEmojiUrl('https://fakegithubassets.com/images/icons/emoji/1f600.png')).toBe(false); // look-alike host
    // real fbcdn PHOTO (not the emoji.php path) must stay downloadable
    expect(isEmojiUrl('https://scontent.xx.fbcdn.net/v/t39.30808-6/photo.jpg')).toBe(false);
    expect(isEmojiUrl('https://www.facebook.com/photo/?fbid=123')).toBe(false); // facebook, non-emoji path
    expect(isEmojiUrl('https://evilfbcdn.net/images/emoji.php/x.png')).toBe(false); // look-alike host (no dot boundary)
    // Shared hosts: only the emoji path segment is excluded, real media stays downloadable.
    expect(isEmojiUrl('https://cdn.discordapp.com/attachments/1/2/photo.png')).toBe(false); // Discord upload, not /emojis/
    expect(isEmojiUrl('https://static-cdn.jtvnw.net/jtv_user_pictures/avatar.png')).toBe(false); // Twitch avatar, not /emoticons/
    expect(isEmojiUrl('https://cdn.jsdelivr.net/npm/react/umd/react.js')).toBe(false); // jsdelivr non-emoji package
    expect(isEmojiUrl('https://fonts.gstatic.com/s/roboto/v30/font.woff2')).toBe(false); // gstatic font, not notoemoji
    expect(isEmojiUrl('https://evilzobj.net/source/apple/1f600.png')).toBe(false); // look-alike of em-content.zobj.net
  });
});
