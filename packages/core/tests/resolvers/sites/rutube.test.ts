import { rutubeVideoId } from '@mbd/core/resolvers/sites/rutube';

describe('rutubeVideoId', () => {
  const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'; // 32 hex

  it.each([
    ['watch URL', `https://rutube.ru/video/${ID}/`, ID],
    ['watch URL without trailing slash', `https://rutube.ru/video/${ID}`, ID],
    ['player embed', `https://rutube.ru/play/embed/${ID}`, ID],
    ['shorts URL', `https://rutube.ru/shorts/${ID}/`, ID],
    ['uppercase hex is normalised', `https://rutube.ru/video/${ID.toUpperCase()}/`, ID],
    ['watch URL with query', `https://rutube.ru/video/${ID}/?playlist=1`, ID],
  ])('extracts the id from a %s', (_label, url, id) => {
    expect(rutubeVideoId(url)).toBe(id);
  });

  it.each([
    ['a channel page', 'https://rutube.ru/channel/12345/'],
    ['the home page', 'https://rutube.ru/'],
    ['a non-32-hex id', 'https://rutube.ru/video/abc123/'],
    ['a look-alike host', `https://notrutube.ru/video/${ID}`],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(rutubeVideoId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(rutubeVideoId(new URL(`https://rutube.ru/video/${ID}/`))).toBe(ID);
  });
});
