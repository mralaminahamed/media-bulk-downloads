import { loomVideoId } from '@mbd/core/resolvers/sites/loom';

const ID = '473fad25ebd24b5ea8091503253dfecf';

describe('loomVideoId', () => {
  it.each([
    ['share', `https://www.loom.com/share/${ID}`, ID],
    ['embed', `https://www.loom.com/embed/${ID}`, ID],
    ['bare host', `https://loom.com/share/${ID}`, ID],
    ['with query', `https://www.loom.com/share/${ID}?t=42&sid=x`, ID],
    ['trailing slash', `https://www.loom.com/share/${ID}/`, ID],
    ['uppercase hex is lowercased', `https://www.loom.com/share/${ID.toUpperCase()}`, ID],
  ])('extracts the 32-hex id from a %s URL', (_label, url, want) => {
    expect(loomVideoId(url)).toBe(want);
  });

  it.each([
    ['a folder listing', 'https://www.loom.com/looms/videos'],
    ['a slug that is not 32-hex', 'https://www.loom.com/share/not-a-valid-loom-id'],
    ['a too-short id', 'https://www.loom.com/share/473fad25'],
    ['a look-alike host', `https://notloom.com/share/${ID}`],
    ['the home page', 'https://www.loom.com/'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_label, url) => {
    expect(loomVideoId(url)).toBeNull();
  });

  it('accepts a URL object', () => {
    expect(loomVideoId(new URL(`https://loom.com/embed/${ID}`))).toBe(ID);
  });
});
