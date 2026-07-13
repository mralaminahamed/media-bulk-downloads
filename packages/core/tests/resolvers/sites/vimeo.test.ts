import { vimeoVideoId } from '@mbd/core/resolvers/sites/vimeo';

describe('vimeoVideoId', () => {
  it.each([
    ['watch URL', 'https://vimeo.com/76979871', '76979871'],
    ['player embed', 'https://player.vimeo.com/video/76979871', '76979871'],
    ['player embed with params', 'https://player.vimeo.com/video/76979871?autoplay=1&muted=1', '76979871'],
    ['channel path', 'https://vimeo.com/channels/staffpicks/76979871', '76979871'],
    ['unlisted video with hash', 'https://vimeo.com/76979871/abc123def', '76979871'],
    ['www host', 'https://www.vimeo.com/76979871', '76979871'],
  ])('extracts the id from a %s', (_label, url, id) => {
    expect(vimeoVideoId(url)).toBe(id);
  });

  it.each([
    ['a user/channel page', 'https://vimeo.com/staffpicks'],
    ['the home page', 'https://vimeo.com/'],
    ['a non-Vimeo host', 'https://notvimeo.com/76979871'],
    ['a too-short numeric path', 'https://vimeo.com/123'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(vimeoVideoId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(vimeoVideoId(new URL('https://player.vimeo.com/video/12345678'))).toBe('12345678');
  });
});
