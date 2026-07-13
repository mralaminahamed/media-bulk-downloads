import type { Mock } from 'vitest';

// Capture what the entrypoint wires into the shared URL sniffer instead of
// installing the real fetch/XHR hooks (those are covered by response-sniffer's
// own tests). This isolates the entrypoint-owned logic: the manifest regex, the
// dedup, the postMessage envelope, and the replay wiring.
vi.mock('@mbd/core/resolvers/sniffers/response-sniffer', () => ({
  installUrlSniffer: vi.fn(),
  installReplayOnReady: vi.fn(),
}));

import { installUrlSniffer, installReplayOnReady } from '@mbd/core/resolvers/sniffers/response-sniffer';
import hlsSniffer from '@/entrypoints/hls-sniffer.content';

type UrlCfg = { isMatch: (url: string) => boolean; onUrl: (url: string) => void };
const runMain = (): UrlCfg => {
  (hlsSniffer.main as () => void)();
  return (installUrlSniffer as Mock).mock.calls.at(-1)![0] as UrlCfg;
};

describe('hls-sniffer content entrypoint', () => {
  beforeEach(() => {
    (installUrlSniffer as Mock).mockClear();
    (installReplayOnReady as Mock).mockClear();
  });

  it('is a MAIN-world, document_start script on all URLs', () => {
    expect(hlsSniffer.matches).toEqual(['<all_urls>']);
    expect(hlsSniffer.runAt).toBe('document_start');
    expect(hlsSniffer.world).toBe('MAIN');
  });

  it('matches HLS (.m3u8) and DASH (.mpd) manifests, with or without a query/hash', () => {
    const { isMatch } = runMain();
    expect(isMatch('https://cdn.example.com/master.m3u8')).toBe(true);
    expect(isMatch('https://cdn.example.com/stream.mpd')).toBe(true);
    expect(isMatch('https://cdn.example.com/v.m3u8?token=abc')).toBe(true);
    expect(isMatch('https://cdn.example.com/v.mpd#frag')).toBe(true);
    // Case-insensitive, since some CDNs upper-case the extension.
    expect(isMatch('https://cdn.example.com/V.M3U8')).toBe(true);
  });

  it('does not match non-manifest URLs (mp4, or a path that merely contains m3u8)', () => {
    const { isMatch } = runMain();
    expect(isMatch('https://cdn.example.com/clip.mp4')).toBe(false);
    expect(isMatch('https://cdn.example.com/m3u8/notreally.txt')).toBe(false);
    expect(isMatch('https://cdn.example.com/photo.jpg')).toBe(false);
  });

  it('posts a newly-seen manifest to the isolated relay, deduping repeats', () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    try {
      const { onUrl } = runMain();
      onUrl('https://cdn.example.com/a.m3u8');
      onUrl('https://cdn.example.com/a.m3u8'); // same URL — must not re-post
      onUrl('https://cdn.example.com/b.mpd');
      expect(post).toHaveBeenCalledTimes(2);
      expect(post).toHaveBeenNthCalledWith(1, { source: 'ibd-hls', urls: ['https://cdn.example.com/a.m3u8'] }, location.origin);
      expect(post).toHaveBeenNthCalledWith(2, { source: 'ibd-hls', urls: ['https://cdn.example.com/b.mpd'] }, location.origin);
    } finally {
      post.mockRestore();
    }
  });

  it('replays every manifest seen so far when the isolated relay announces itself', () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    try {
      const { onUrl } = runMain();
      onUrl('https://cdn.example.com/a.m3u8');
      onUrl('https://cdn.example.com/b.mpd');
      post.mockClear();

      const [source, replay] = (installReplayOnReady as Mock).mock.calls.at(-1)!;
      expect(source).toBe('ibd-hls-ready');
      (replay as () => void)();
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        { source: 'ibd-hls', urls: ['https://cdn.example.com/a.m3u8', 'https://cdn.example.com/b.mpd'] },
        location.origin,
      );
    } finally {
      post.mockRestore();
    }
  });

  it('does not replay when nothing has been seen yet', () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    try {
      runMain();
      const replay = (installReplayOnReady as Mock).mock.calls.at(-1)![1] as () => void;
      replay();
      expect(post).not.toHaveBeenCalled();
    } finally {
      post.mockRestore();
    }
  });
});
