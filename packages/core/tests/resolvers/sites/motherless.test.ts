import { motherlessMediaId, motherlessMediaFromHtml } from '@mbd/core/resolvers/sites/motherless';

describe('motherlessMediaId', () => {
  it.each([
    ['a media page', 'https://motherless.com/ABC123', 'ABC123'],
    ['with trailing slash', 'https://motherless.com/2E7F4A9/', '2E7F4A9'],
  ])('extracts the id from %s', (_l, url, want) => {
    expect(motherlessMediaId(url)).toBe(want);
  });

  it.each([
    ['a group route (two segments)', 'https://motherless.com/g/some_group'],
    ['a non-motherless host', 'https://example.com/ABC123'],
  ])('returns null for %s', (_l, url) => {
    expect(motherlessMediaId(url)).toBeNull();
  });
});

describe('motherlessMediaFromHtml', () => {
  const ID = 'ABC123';

  it('reads a video __fileurl, pinned to the motherless CDN', () => {
    const html = "<script>var __fileurl = 'https://cdn5-videos.motherlessmedia.com/videos/ABC123.mp4';</script>";
    expect(motherlessMediaFromHtml(html, ID)).toEqual([
      { url: 'https://cdn5-videos.motherlessmedia.com/videos/ABC123.mp4', kind: 'video', ext: 'mp4', mediaKey: 'motherless ABC123' },
    ]);
  });

  it('classifies an image __fileurl', () => {
    const html = "__fileurl = \"https://cdn5-images.motherlessmedia.com/images/ABC123.jpg\"";
    expect(motherlessMediaFromHtml(html, ID)[0]).toEqual({
      url: 'https://cdn5-images.motherlessmedia.com/images/ABC123.jpg',
      kind: 'image',
      ext: 'jpg',
      mediaKey: 'motherless ABC123',
    });
  });

  it.each([
    ['an off-CDN __fileurl', "__fileurl = 'https://evil.com/x.mp4'"],
    ['no __fileurl (a gallery/listing)', '<div>gallery of thumbs</div>'],
  ])('returns [] for %s (fails closed)', (_l, html) => {
    expect(motherlessMediaFromHtml(html, ID)).toEqual([]);
  });
});
