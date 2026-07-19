import { xhamsterVideoId, xhamsterMediaFromHtml } from '@mbd/core/resolvers/sites/xhamster';

describe('xhamsterVideoId', () => {
  it.each([
    ['/videos/<slug>-<id>', 'https://xhamster.com/videos/some-title-987654', '987654'],
    ['a .desi mirror', 'https://xhamster.desi/videos/x-abc12', 'abc12'],
  ])('extracts the id from %s', (_l, url, want) => {
    expect(xhamsterVideoId(url)).toBe(want);
  });

  it('returns null for a non-xhamster host', () => {
    expect(xhamsterVideoId('https://example.com/videos/x-1')).toBeNull();
  });
});

describe('xhamsterMediaFromHtml', () => {
  const wrap = (videoModel: unknown) => `<script>window.initials = ${JSON.stringify({ videoModel })};</script>`;

  it('surfaces the highest-quality mp4 from sources.mp4, pinned to xhcdn.com', () => {
    const html = wrap({
      id: 987654,
      sources: {
        mp4: {
          '240p': 'https://a.xhcdn.com/x/240.mp4',
          '1080p': 'https://a.xhcdn.com/x/1080.mp4',
          '480p': 'https://a.xhcdn.com/x/480.mp4',
        },
      },
    });
    expect(xhamsterMediaFromHtml(html, '987654')).toEqual([
      { url: 'https://a.xhcdn.com/x/1080.mp4', kind: 'video', ext: 'mp4', mediaKey: 'xhamster 987654' },
    ]);
  });

  it('reads sources.standard.h264[] and picks the highest quality', () => {
    const html = wrap({
      sources: {
        standard: {
          h264: [
            { url: 'https://a.xhcdn.com/x/720.mp4', quality: '720p' },
            { url: 'https://a.xhcdn.com/x/1080.mp4', quality: '1080p' },
          ],
        },
      },
    });
    expect(xhamsterMediaFromHtml(html, '1')[0].url).toBe('https://a.xhcdn.com/x/1080.mp4');
  });

  it('drops off-CDN urls and returns [] with no usable source', () => {
    expect(xhamsterMediaFromHtml(wrap({ sources: { mp4: { '720p': 'https://evil.com/x.mp4' } } }), '1')).toEqual([]);
    expect(xhamsterMediaFromHtml('<div>no initials</div>', '1')).toEqual([]);
  });
});
