import type { Mock } from 'vitest';

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
      onUrl('https://cdn.example.com/a.m3u8');
      onUrl('https://cdn.example.com/b.mpd');
      expect(post).toHaveBeenCalledTimes(2);
      expect(post).toHaveBeenNthCalledWith(1, { source: 'mbd-hls', urls: ['https://cdn.example.com/a.m3u8'] }, location.origin);
      expect(post).toHaveBeenNthCalledWith(2, { source: 'mbd-hls', urls: ['https://cdn.example.com/b.mpd'] }, location.origin);
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
      expect(source).toBe('mbd-hls-ready');
      (replay as () => void)();
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        { source: 'mbd-hls', urls: ['https://cdn.example.com/a.m3u8', 'https://cdn.example.com/b.mpd'] },
        location.origin,
      );
    } finally {
      post.mockRestore();
    }
  });

  it('caps the seen-set on <all_urls> so a page cannot grow it without bound', () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    try {
      const { onUrl } = runMain();
      for (let i = 0; i < 600; i++) onUrl(`https://cdn.example.com/${i}.m3u8`);
      post.mockClear();
      const replay = (installReplayOnReady as Mock).mock.calls.at(-1)![1] as () => void;
      replay();
      const urls = (post.mock.calls.at(-1)![0] as { urls: string[] }).urls;
      expect(urls).toHaveLength(500);
      expect(urls).toContain('https://cdn.example.com/599.m3u8');
      expect(urls).not.toContain('https://cdn.example.com/0.m3u8');
    } finally {
      post.mockRestore();
    }
  });

  it('re-posts a manifest whose seen-entry was evicted by the cap (no permanent suppression)', () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    try {
      const { onUrl } = runMain();
      onUrl('https://cdn.example.com/first.m3u8');
      for (let i = 0; i < 600; i++) onUrl(`https://cdn.example.com/f${i}.m3u8`);
      post.mockClear();
      onUrl('https://cdn.example.com/first.m3u8');
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({ source: 'mbd-hls', urls: ['https://cdn.example.com/first.m3u8'] }, location.origin);
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
