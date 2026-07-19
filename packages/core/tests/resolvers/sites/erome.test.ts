import { eromeAlbumId, eromeMediaFromHtml } from '@mbd/core/resolvers/sites/erome';

describe('eromeAlbumId', () => {
  it.each([
    ['bare host', 'https://erome.com/a/AbCd1234', 'AbCd1234'],
    ['www host', 'https://www.erome.com/a/xyz789', 'xyz789'],
    ['with query/hash', 'https://www.erome.com/a/QwErTy?ref=1#top', 'QwErTy'],
  ])('extracts the album id from a %s URL', (_l, url, want) => {
    expect(eromeAlbumId(url)).toBe(want);
  });

  it.each([
    ['a profile page', 'https://www.erome.com/someuser'],
    ['a non-erome host', 'https://example.com/a/AbCd1234'],
    ['a malformed URL', 'http://'],
  ])('returns null for %s', (_l, url) => {
    expect(eromeAlbumId(url)).toBeNull();
  });
});

describe('eromeMediaFromHtml', () => {
  const ID = 'AbCd1234';

  it('surfaces the video source and lazy image data-src per media-group', () => {
    const html = `
      <div class="media-group" data-group-id="1">
        <div class="video-controls"><video preload="none" poster="https://s10.erome.com/p.jpg">
          <source src="https://s10.erome.com/1234/AbCd1234/clip.mp4" type="video/mp4"></video></div>
      </div>
      <div class="media-group" data-group-id="2">
        <img class="img-front" src="https://s10.erome.com/1234/AbCd1234/placeholder.jpg">
        <img class="img-back lasyload" data-src="https://s10.erome.com/1234/AbCd1234/photo.jpg">
      </div>`;
    expect(eromeMediaFromHtml(html, ID)).toEqual([
      { url: 'https://s10.erome.com/1234/AbCd1234/clip.mp4', kind: 'video', ext: 'mp4', mediaKey: 'erome AbCd1234 0' },
      { url: 'https://s10.erome.com/1234/AbCd1234/photo.jpg', kind: 'image', ext: 'jpg', mediaKey: 'erome AbCd1234 1' },
    ]);
  });

  it('marks a .gif data-src as kind gif', () => {
    const html = `<div class="media-group"><img class="img-back" data-src="https://s2.erome.com/x/anim.gif"></div>`;
    expect(eromeMediaFromHtml(html, ID)[0].kind).toBe('gif');
  });

  it('drops off-CDN URLs and dedups repeats', () => {
    const html = `
      <div class="media-group"><img data-src="https://evil.example.com/x/a.jpg"></div>
      <div class="media-group"><img data-src="https://s1.erome.com/x/a.jpg"></div>
      <div class="media-group"><img data-src="https://s1.erome.com/x/a.jpg"></div>`;
    expect(eromeMediaFromHtml(html, ID).map((c) => c.url)).toEqual(['https://s1.erome.com/x/a.jpg']);
  });

  it('returns [] for a page with no media-groups (private/removed album)', () => {
    expect(eromeMediaFromHtml('<div>Album is private</div>', ID)).toEqual([]);
  });
});
