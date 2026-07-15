import { streamableVideoId } from '@mbd/core/resolvers/sites/streamable';

describe('streamableVideoId', () => {
  it.each([
    ['watch URL', 'https://streamable.com/moo9j0', 'moo9j0'],
    ['watch URL with query', 'https://streamable.com/hn8hq?t=3', 'hn8hq'],
    ['/e/ embed', 'https://streamable.com/e/moo9j0', 'moo9j0'],
    ['/o/ embed', 'https://streamable.com/o/moo9j0?loop=0', 'moo9j0'],
    ['/s/ embed', 'https://streamable.com/s/moo9j0', 'moo9j0'],
    ['www host', 'https://www.streamable.com/moo9j0', 'moo9j0'],
  ])('extracts the shortcode from a %s', (_label, url, id) => {
    expect(streamableVideoId(url)).toBe(id);
  });

  it.each([
    ['a reserved page (login)', 'https://streamable.com/login'],
    ['a reserved page (signup)', 'https://streamable.com/signup'],
    ['the home page', 'https://streamable.com/'],
    ['a non-Streamable host', 'https://notstreamable.com/moo9j0'],
    ['a nested non-video path', 'https://streamable.com/user/foo'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(streamableVideoId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(streamableVideoId(new URL('https://streamable.com/e/abc12'))).toBe('abc12');
  });
});
