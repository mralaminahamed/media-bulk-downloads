import { fanboxPostId, fanboxImagesFromHtml } from '@mbd/core/resolvers/sites/fanbox';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

describe('fanboxPostId', () => {
  it.each([
    ['creator subdomain', 'https://yatorie.fanbox.cc/posts/12243785', '12243785'],
    ['www /@creator form', 'https://www.fanbox.cc/@yatorie/posts/12243785', '12243785'],
    ['with query/hash', 'https://yatorie.fanbox.cc/posts/12243785?foo=1#x', '12243785'],
  ])('extracts the post id from a %s URL', (_l, url, want) => {
    expect(fanboxPostId(url)).toBe(want);
  });

  it.each([
    ['a creator home', 'https://yatorie.fanbox.cc/'],
    ['a plan page', 'https://www.fanbox.cc/@yatorie/plans'],
    ['a non-fanbox host', 'https://example.com/posts/12243785'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_l, url) => {
    expect(fanboxPostId(url)).toBeNull();
  });
});

describe('fanboxImagesFromHtml', () => {
  const POST = '12243785';
  const u1 = 'https://downloads.fanbox.cc/images/post/12243785/C80oWmIvB32WmAmqymXYK6UC.jpeg';
  const u2 = 'https://downloads.fanbox.cc/images/post/12243785/IZxSCxk4hxfG2psXtDIx4umg.jpeg';
  const other = 'https://downloads.fanbox.cc/images/post/99999999/ZZother.png';
  const html = `<div>...${u1}...</div><a href="${u2}">dl</a> related:${other} <img src="${u1}">`;

  it('scrapes every original for the post id, deduped, excluding other posts', () => {
    const out = fanboxImagesFromHtml(html, POST);
    expect(out.map((c) => c.url)).toEqual([u1, u2]);
    expect(out[0]).toEqual({ url: u1, kind: 'image', ext: imageExtFromUrl(u1), mediaKey: 'fanbox C80oWmIvB32WmAmqymXYK6UC' });
  });

  it('marks a .gif original as kind gif', () => {
    const g = 'https://downloads.fanbox.cc/images/post/12243785/animKEY.gif';
    const [c] = fanboxImagesFromHtml(`x ${g} y`, POST);
    expect(c.kind).toBe('gif');
  });

  it('returns [] for a page with no originals (paid/inaccessible post)', () => {
    expect(fanboxImagesFromHtml('<div>no images here</div>', POST)).toEqual([]);
  });

  it('returns [] for a non-numeric post id (guard)', () => {
    expect(fanboxImagesFromHtml(html, 'abc')).toEqual([]);
  });
});
