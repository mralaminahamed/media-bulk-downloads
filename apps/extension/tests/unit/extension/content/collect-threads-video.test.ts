/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.threads.com/" }
 *
 * Verifies collectMedia() surfaces a MOUNTED Threads video as a downloadable
 * item. Threads runs on Instagram infra but — unlike IG reels (blob:-backed) — a
 * mounted <video> carries a REAL https progressive .mp4 in its src (cdninstagram),
 * which the generic collectAv path already collects. jsdom does not populate
 * video.currentSrc, so the src attribute is set directly (collectAv also reads
 * getAttribute('src')). Uses the REAL collector (no mocks). Negative cases pin the
 * passive limitation: a blob: <video> (unmounted) and an .m3u8 <video> (manifest,
 * routed to HLS) are not surfaced as a plain downloadable mp4.
 */
import { collectMedia } from '@/extension/content/collect';

const MP4 = 'https://scontent.cdninstagram.com/o1/v/t2/THREADS_VID.mp4';
const POSTER = 'https://scontent.cdninstagram.com/v/t51/THREADS_VID_POSTER.jpg';

describe('collectMedia — Threads video', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects a mounted <video> https mp4 as one downloadable video item', () => {
    document.body.innerHTML = `<video src="${MP4}"></video>`;

    const vids = collectMedia().filter((m) => m.kind === 'video');

    expect(vids).toHaveLength(1);
    expect(vids[0].src).toBe(MP4);
    expect(vids[0].type).toBe('mp4');
  });

  it('does not surface a blob: <video> (unmounted/streaming) as a downloadable item', () => {
    document.body.innerHTML = `<video src="blob:https://www.threads.com/abc-123"></video>`;

    const items = collectMedia();

    expect(items.some((m) => m.src.startsWith('blob:'))).toBe(false);
    expect(items.filter((m) => m.kind === 'video')).toHaveLength(0);
  });

  it('routes an .m3u8 <video> to HLS capture, not a plain mp4', () => {
    const M3U8 = 'https://scontent.cdninstagram.com/o1/v/t2/THREADS_VID.m3u8';
    document.body.innerHTML = `<video src="${M3U8}"></video>`;

    const item = collectMedia().find((m) => m.src === M3U8);

    expect(item).toMatchObject({ kind: 'video', type: 'm3u8', hlsManifest: M3U8 });
  });

  it('carries a real poster attribute onto the video item', () => {
    document.body.innerHTML = `<video src="${MP4}" poster="${POSTER}"></video>`;

    const vids = collectMedia().filter((m) => m.kind === 'video');

    expect(vids).toHaveLength(1);
    expect(vids[0].poster).toBe(POSTER);
  });
});
