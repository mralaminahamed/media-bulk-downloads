import { isEmojiUrl } from '@/extension/shared/collection/emoji';

describe('isEmojiUrl', () => {
  it('flags twemoji served by known CDNs', () => {
    expect(isEmojiUrl('https://abs.twimg.com/emoji/v2/svg/1f9f8.svg')).toBe(true);
    expect(isEmojiUrl('https://s.w.org/images/core/emoji/14.0.0/svg/1f600.svg')).toBe(true);
    expect(isEmojiUrl('https://twemoji.maxcdn.com/v/latest/svg/1f600.svg')).toBe(true);
    expect(isEmojiUrl('https://cdn.jsdelivr.net/gh/twitter/twemoji/assets/svg/1f600.svg')).toBe(true);
    expect(isEmojiUrl('https://github.githubassets.com/images/icons/emoji/unicode/1f600.png')).toBe(true);
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
  });
});
