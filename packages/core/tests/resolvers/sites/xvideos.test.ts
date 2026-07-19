import { xvideosVideoId, xvideosMediaFromHtml } from '@mbd/core/resolvers/sites/xvideos';

describe('xvideosVideoId', () => {
  it.each([
    ['/video<id>/', 'https://www.xvideos.com/video12345678/some_slug', '12345678'],
    ['/video.<id>/', 'https://www.xvideos.com/video.abc123/slug', 'abc123'],
  ])('extracts the id from %s', (_l, url, want) => {
    expect(xvideosVideoId(url)).toBe(want);
  });

  it.each([
    ['a profile page', 'https://www.xvideos.com/profiles/someone'],
    ['a non-xvideos host', 'https://example.com/video1/x'],
  ])('returns null for %s', (_l, url) => {
    expect(xvideosVideoId(url)).toBeNull();
  });
});

describe('xvideosMediaFromHtml', () => {
  it('surfaces the setVideoUrlHigh mp4, pinned to the xvideos CDN', () => {
    const html =
      "<script>html5player.setVideoUrlLow('https://cdn.xvideos-cdn.com/x/low.mp4');" +
      "html5player.setVideoUrlHigh('https://cdn.xvideos-cdn.com/x/high.mp4');" +
      "html5player.setVideoHLS('https://cdn.xvideos-cdn.com/x/hls.m3u8');</script>";
    expect(xvideosMediaFromHtml(html, '12345678')).toEqual([
      { url: 'https://cdn.xvideos-cdn.com/x/high.mp4', kind: 'video', ext: 'mp4', mediaKey: 'xvideos 12345678' },
    ]);
  });

  it('falls back to setVideoUrlLow when there is no High', () => {
    const html = "html5player.setVideoUrlLow('https://cdn.xvideos-cdn.com/x/low.mp4')";
    expect(xvideosMediaFromHtml(html, '1')[0].url).toBe('https://cdn.xvideos-cdn.com/x/low.mp4');
  });

  it('drops an off-CDN url and returns [] when there are no player setters', () => {
    expect(xvideosMediaFromHtml("html5player.setVideoUrlHigh('https://evil.com/x.mp4')", '1')).toEqual([]);
    expect(xvideosMediaFromHtml('<div>removed</div>', '1')).toEqual([]);
  });
});
