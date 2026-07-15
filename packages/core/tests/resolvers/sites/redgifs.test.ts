import { redgifsVideoId } from '@mbd/core/resolvers/sites/redgifs';

describe('redgifsVideoId', () => {
  it.each([
    ['watch URL', 'https://www.redgifs.com/watch/brightshinyexample', 'brightshinyexample'],
    ['watch URL, apex host', 'https://redgifs.com/watch/brightshinyexample', 'brightshinyexample'],
    ['watch URL with query', 'https://www.redgifs.com/watch/brightshinyexample?rel=1', 'brightshinyexample'],
    ['/ifr/ embed', 'https://www.redgifs.com/ifr/brightshinyexample', 'brightshinyexample'],
    ['mixed-case id lowercased', 'https://www.redgifs.com/watch/BrightShinyExample', 'brightshinyexample'],
  ])('extracts the id from a %s', (_label, url, id) => {
    expect(redgifsVideoId(url)).toBe(id);
  });

  it.each([
    ['a listing page', 'https://www.redgifs.com/gifs/trending'],
    ['a user page', 'https://www.redgifs.com/users/someone'],
    ['the home page', 'https://www.redgifs.com/'],
    ['a non-RedGifs host', 'https://notredgifs.com/watch/foo'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(redgifsVideoId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(redgifsVideoId(new URL('https://redgifs.com/watch/abc'))).toBe('abc');
  });
});
