import { imgpilePostSlug, imgpileMediaFromHtml } from '@mbd/core/resolvers/sites/imgpile';

describe('imgpilePostSlug', () => {
  it.each([
    ['a post url', 'https://imgpile.com/p/AbC-123', 'AbC-123'],
    ['with query', 'https://imgpile.com/p/xyz?k=1', 'xyz'],
  ])('extracts the slug from %s', (_l, url, want) => {
    expect(imgpilePostSlug(url)).toBe(want);
  });

  it.each([
    ['a user page', 'https://imgpile.com/u/someone'],
    ['a non-imgpile host', 'https://example.com/p/AbC'],
  ])('returns null for %s', (_l, url) => {
    expect(imgpilePostSlug(url)).toBeNull();
  });
});

describe('imgpileMediaFromHtml', () => {
  const SLUG = 'AbC-123';

  it('reads each post-media block’s <a href> in order, deduped', () => {
    const html = `
      <div class="post-media" data-media-id="1"><a href="https://imgpile.com/f/aaa.jpg"><img src="t1"></a></div>
      <div class="post-media" data-media-id="2"><a href="https://imgpile.com/f/bbb.mp4"><img src="t2"></a></div>
      <div class="post-media" data-media-id="1"><a href="https://imgpile.com/f/aaa.jpg"><img src="t1"></a></div>`;
    expect(imgpileMediaFromHtml(html, SLUG)).toEqual([
      { url: 'https://imgpile.com/f/aaa.jpg', kind: 'image', ext: 'jpg', mediaKey: 'imgpile AbC-123 0' },
      { url: 'https://imgpile.com/f/bbb.mp4', kind: 'video', ext: 'mp4', mediaKey: 'imgpile AbC-123 1' },
    ]);
  });

  it('skips non-media hrefs (a post-page link) and returns [] with no blocks', () => {
    const html = '<div class="post-media"><a href="https://imgpile.com/p/other">more</a></div>';
    expect(imgpileMediaFromHtml(html, SLUG)).toEqual([]);
    expect(imgpileMediaFromHtml('<div>no media</div>', SLUG)).toEqual([]);
  });
});
