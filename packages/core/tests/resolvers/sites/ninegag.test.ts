import { nineGagId } from '@mbd/core/resolvers/sites/ninegag';

describe('nineGagId', () => {
  it.each([
    ['a post permalink', 'https://9gag.com/gag/aOMMxxA', 'aOMMxxA'],
    ['a post with a title slug segment stripped', 'https://9gag.com/gag/a1b2c3d?ref=android', 'a1b2c3d'],
    ['a trailing-path post', 'https://9gag.com/gag/aOMMxxA/media', 'aOMMxxA'],
    ['the www host', 'https://www.9gag.com/gag/aOMMxxA', 'aOMMxxA'],
  ])('extracts the id from %s', (_label, url, id) => {
    expect(nineGagId(url)).toBe(id);
  });

  it.each([
    ['a section page', 'https://9gag.com/trending'],
    ['the tag/interest page', 'https://9gag.com/tag/cats'],
    ['the home page', 'https://9gag.com/'],
    ['a non-9GAG host', 'https://not9gag.com/gag/aOMMxxA'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(nineGagId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(nineGagId(new URL('https://9gag.com/gag/aOMMxxA'))).toBe('aOMMxxA');
  });
});
