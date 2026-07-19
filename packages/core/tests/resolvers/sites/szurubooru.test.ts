import { szurubooruRef, szurubooruMediaFromHtml } from '@mbd/core/resolvers/sites/szurubooru';

describe('szurubooruRef', () => {
  it.each([
    ['snootbooru post', 'https://snootbooru.com/post/12345', { host: 'snootbooru.com', id: '12345' }],
    ['bcbnsfw post', 'https://booru.bcbnsfw.space/post/9', { host: 'booru.bcbnsfw.space', id: '9' }],
  ])('parses a %s', (_l, url, want) => {
    expect(szurubooruRef(url)).toEqual(want);
  });

  it.each([
    ['a listing (no /post/)', 'https://snootbooru.com/posts'],
    ['a non-szuru host', 'https://example.com/post/1'],
  ])('returns null for %s', (_l, url) => {
    expect(szurubooruRef(url)).toBeNull();
  });
});

describe('szurubooruMediaFromHtml', () => {
  const ref = { host: 'snootbooru.com', id: '12345' };

  it('reads the /data/posts original (absolute url), skipping thumbnails', () => {
    const html =
      '<img src="https://snootbooru.com/data/generated-thumbnails/12345_abc.jpg">' +
      '<img class="post-content-image" src="https://snootbooru.com/data/posts/12345_deadbeef.png">';
    expect(szurubooruMediaFromHtml(html, ref)).toEqual([
      { url: 'https://snootbooru.com/data/posts/12345_deadbeef.png', kind: 'image', ext: 'png', mediaKey: 'szuru snootbooru.com 12345' },
    ]);
  });

  it('resolves a relative /data/posts reference against the host', () => {
    const html = '<a href="/data/posts/12345_beef.mp4">download</a>';
    expect(szurubooruMediaFromHtml(html, ref)[0]).toEqual({
      url: 'https://snootbooru.com/data/posts/12345_beef.mp4',
      kind: 'video',
      ext: 'mp4',
      mediaKey: 'szuru snootbooru.com 12345',
    });
  });

  it('drops an off-host /data/posts url and returns [] when the post has not rendered', () => {
    expect(szurubooruMediaFromHtml('<img src="https://evil.com/data/posts/1_x.jpg">', ref)).toEqual([]);
    expect(szurubooruMediaFromHtml('<div id="app"><!-- unhydrated --></div>', ref)).toEqual([]);
  });
});
