/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://x.com/u/media" }
 *
 * Verifies collectMedia() emits PENDING items (unresolvedImage / unresolvedVideo)
 * for X `/status/<id>/photo|video/<n>` grid cells that have NOT rendered a real
 * pbs.twimg.com media <img> — the "unpainted cell" case a lazy-loading grid leaves
 * behind on a fast scroll. Uses the REAL collector (no mocks). A cell that already
 * rendered its media <img> is handled by the existing img pass and must NOT also
 * get a duplicate pending item.
 */
import { collectMedia } from '@/extension/content/collect';

describe('collectMedia — Twitter/X pending status cells', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('emits a pending image for an unpainted /status/photo cell', () => {
    document.body.innerHTML = `<a href="/u/status/1700000000000000001/photo/2"><div></div></a>`;
    const items = collectMedia();
    const p = items.find((m) => m.unresolvedImage);
    expect(p).toMatchObject({
      kind: 'image',
      unresolvedImage: true,
      resolveHint: { platform: 'twitter', id: 'photo 1700000000000000001 2' },
    });
  });

  it('does NOT emit a pending item when the cell already rendered a pbs media img', () => {
    document.body.innerHTML = `<a href="/u/status/1700000000000000002/photo/1"><img src="https://pbs.twimg.com/media/AA?format=jpg&name=360x360"></a>`;
    const items = collectMedia();
    expect(items.some((m) => m.unresolvedImage)).toBe(false);
    expect(items.filter((m) => m.kind === 'image')).toHaveLength(1);
  });

  it('emits a pending video for an unpainted /status/video cell', () => {
    document.body.innerHTML = `<a href="/u/status/1700000000000000003/video/1"><div></div></a>`;
    const items = collectMedia();
    expect(items.find((m) => m.unresolvedVideo)).toMatchObject({
      kind: 'video',
      resolveHint: { platform: 'twitter', id: '1700000000000000003' },
    });
  });

  it('does NOT emit a second pending video for a mounted <video poster> cell', () => {
    document.body.innerHTML =
      `<a href="/u/status/1700000000000000009/video/1"><video poster="https://pbs.twimg.com/amplify_video_thumb/999/img/y.jpg"></video></a>`;
    const items = collectMedia();
    const videoItems = items.filter((m) => m.kind === 'video');
    expect(videoItems).toHaveLength(1);
    expect(videoItems[0]).toMatchObject({
      src: 'https://pbs.twimg.com/amplify_video_thumb/999/img/y.jpg',
      unresolvedVideo: true,
      resolveHint: { platform: 'twitter', id: '1700000000000000009' },
    });
  });

  it('does NOT emit a second pending video for a painted GIF cell (tweet_video_thumb poster)', () => {
    document.body.innerHTML =
      `<a href="/u/status/1700000000000000010/video/1"><video poster="https://pbs.twimg.com/tweet_video_thumb/ABC"></video></a>`;
    const items = collectMedia();
    const videoItems = items.filter((m) => m.kind === 'video');
    expect(videoItems).toHaveLength(1);
    expect(videoItems[0]).toMatchObject({
      src: 'https://video.twimg.com/tweet_video/ABC.mp4',
      poster: 'https://pbs.twimg.com/tweet_video_thumb/ABC',
    });
    expect(videoItems[0].unresolvedVideo).toBeFalsy();
  });
});
