import { imgchestPostId, imgchestMediaFromHtml } from '@mbd/core/resolvers/sites/imagechest';

describe('imgchestPostId', () => {
  it.each([
    ['post URL', 'https://imgchest.com/p/abc123XYZ', 'abc123XYZ'],
    ['with query', 'https://imgchest.com/p/abc123XYZ?x=1', 'abc123XYZ'],
  ])('extracts the post id from a %s', (_l, url, want) => {
    expect(imgchestPostId(url)).toBe(want);
  });

  it.each([
    ['a user page', 'https://imgchest.com/u/someone'],
    ['a non-imgchest host', 'https://example.com/p/abc123XYZ'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_l, url) => {
    expect(imgchestPostId(url)).toBeNull();
  });
});

describe('imgchestMediaFromHtml', () => {
  const ID = 'abc123XYZ';

  it('extracts every cdn file URL from the Inertia data-page payload, ordered + deduped', () => {
    const dataPage =
      '{"component":"Post","props":{"post":{"images":[' +
      '{"id":"aa","link":"https://cdn.imgchest.com/files/aa1.jpg"},' +
      '{"id":"bb","link":"https://cdn.imgchest.com/files/bb2.png"},' +
      '{"id":"aa","link":"https://cdn.imgchest.com/files/aa1.jpg"}]}}}';
    const html = `<div id="app" data-page='${dataPage}'></div>`;
    expect(imgchestMediaFromHtml(html, ID)).toEqual([
      { url: 'https://cdn.imgchest.com/files/aa1.jpg', kind: 'image', ext: 'jpg', mediaKey: 'imgchest abc123XYZ 0' },
      { url: 'https://cdn.imgchest.com/files/bb2.png', kind: 'image', ext: 'png', mediaKey: 'imgchest abc123XYZ 1' },
    ]);
  });

  it('classifies gif and mp4 files by extension', () => {
    const html = 'x https://cdn.imgchest.com/files/g.gif y https://cdn.imgchest.com/files/v.mp4 z';
    expect(imgchestMediaFromHtml(html, ID).map((c) => c.kind)).toEqual(['gif', 'video']);
  });

  it('returns [] when no cdn file URLs are present', () => {
    expect(imgchestMediaFromHtml('<div>Not found</div>', ID)).toEqual([]);
  });
});
