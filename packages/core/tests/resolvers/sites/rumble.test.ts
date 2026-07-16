import { rumbleWatchUrl } from '@mbd/core/resolvers/sites/rumble';

describe('rumbleWatchUrl', () => {
  it.each([
    ['watch page with slug', 'https://rumble.com/v7chusk-some-title.html', 'https://rumble.com/v7chusk-some-title.html'],
    ['bare watch page', 'https://rumble.com/v7chusk.html', 'https://rumble.com/v7chusk.html'],
    ['www host is canonicalised', 'https://www.rumble.com/v7chusk-x.html', 'https://rumble.com/v7chusk-x.html'],
    ['player embed', 'https://rumble.com/embed/v7ab6sc/', 'https://rumble.com/embed/v7ab6sc/'],
    ['player embed without trailing slash', 'https://rumble.com/embed/v7ab6sc', 'https://rumble.com/embed/v7ab6sc/'],
  ])('returns the canonical URL for a %s', (_label, url, want) => {
    expect(rumbleWatchUrl(url)).toBe(want);
  });

  it.each([
    ['a channel page', 'https://rumble.com/c/somechannel'],
    ['the home page', 'https://rumble.com/'],
    ['a category listing', 'https://rumble.com/category/news/videos'],
    ['a look-alike host', 'https://notrumble.com/v7chusk.html'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(rumbleWatchUrl(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(rumbleWatchUrl(new URL('https://rumble.com/v7chusk-x.html'))).toBe('https://rumble.com/v7chusk-x.html');
  });
});
