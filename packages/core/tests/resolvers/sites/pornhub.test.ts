import { pornhubVideoId, pornhubMediaFromHtml } from '@mbd/core/resolvers/sites/pornhub';

describe('pornhubVideoId', () => {
  it.each([
    ['a watch page viewkey', 'https://www.pornhub.com/view_video.php?viewkey=ph5abc123', 'ph5abc123'],
    ['an embed page', 'https://www.pornhub.com/embed/abc123def', 'abc123def'],
    ['a regional subdomain', 'https://cn.pornhub.com/view_video.php?viewkey=xyz9', 'xyz9'],
  ])('extracts the id from %s', (_l, url, want) => {
    expect(pornhubVideoId(url)).toBe(want);
  });

  it.each([
    ['a non-pornhub host', 'https://example.com/view_video.php?viewkey=ph1'],
    ['a listing page (no viewkey)', 'https://www.pornhub.com/video?c=1'],
    ['a model page', 'https://www.pornhub.com/model/someone'],
  ])('returns null for %s', (_l, url) => {
    expect(pornhubVideoId(url)).toBeNull();
  });
});

describe('pornhubMediaFromHtml', () => {
  const wrap = (fv: unknown) => `<script>var flashvars_487356025 = ${JSON.stringify(fv)};</script>`;

  it('surfaces the HLS master (quality array) from mediaDefinitions, pinned to phncdn.com', () => {
    const html = wrap({
      image_url: 'https://ci.phncdn.com/poster.jpg',
      mediaDefinitions: [
        { format: 'hls', videoUrl: 'https://hv-h.phncdn.com/x/240/master.m3u8?t=1', quality: '240' },
        { format: 'hls', videoUrl: 'https://hv-h.phncdn.com/x/master.m3u8?t=1', quality: ['240', '720', '1080'] },
        { format: 'mp4', videoUrl: 'https://www.pornhub.com/video/get_media?s=1', quality: ['720'], remote: true },
      ],
    });
    expect(pornhubMediaFromHtml(html, 'ph5abc123')).toEqual([
      {
        url: 'https://hv-h.phncdn.com/x/master.m3u8?t=1',
        kind: 'video',
        ext: 'm3u8',
        poster: 'https://ci.phncdn.com/poster.jpg',
        mediaKey: 'pornhub ph5abc123',
      },
    ]);
  });

  it('falls back to a single-quality HLS entry when no master array is present', () => {
    const html = wrap({
      mediaDefinitions: [
        { format: 'hls', videoUrl: 'https://hv-h.phncdn.com/x/720/master.m3u8', quality: '720' },
      ],
    });
    expect(pornhubMediaFromHtml(html, '1')[0].url).toBe('https://hv-h.phncdn.com/x/720/master.m3u8');
  });

  it('skips the remote/get_media mp4 entry and off-CDN urls; fails closed', () => {
    expect(
      pornhubMediaFromHtml(
        wrap({ mediaDefinitions: [{ format: 'mp4', videoUrl: 'https://www.pornhub.com/video/get_media?s=1', quality: ['720'], remote: true }] }),
        '1',
      ),
    ).toEqual([]);
    expect(
      pornhubMediaFromHtml(wrap({ mediaDefinitions: [{ format: 'hls', videoUrl: 'https://evil.com/master.m3u8', quality: ['720'] }] }), '1'),
    ).toEqual([]);
    expect(pornhubMediaFromHtml('<div>no flashvars</div>', '1')).toEqual([]);
    expect(pornhubMediaFromHtml(wrap({ mediaDefinitions: 'ENCODED' }), '1')).toEqual([]);
  });
});
