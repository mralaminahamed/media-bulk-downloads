import { vi } from 'vitest';
import { resolveOriginal } from '@mbd/core/resolvers/network';
import pinWidget from '../fixtures/pinterest/pin-video-widget.json';
import asProject from '../fixtures/artstation/project.json';
import tweetResultVideo from '../fixtures/twitter/tweet-result-video.json';
import tweetResultPhoto from '../fixtures/twitter/tweet-result-photo.json';
import wallhavenWallpaper from '../fixtures/wallhaven/wallpaper.json';
import bskyDidDoc from '../fixtures/bsky/did-plc-doc.json';
import bskyDidWebDoc from '../fixtures/bsky/did-web-doc.json';
import vimeoConfig from '../fixtures/vimeo/player-config.json';
import vimeoHlsConfig from '../fixtures/vimeo/player-config-hls.json';
import redditVideo from '../fixtures/reddit/reddit-video.json';
import tweetResultHls from '../fixtures/twitter/tweet-result-hls.json';
import pinHlsWidget from '../fixtures/pinterest/pin-hls-widget.json';
import twitchClip from '../fixtures/twitch/clip.json';

import flickrSizesHtml from '../fixtures/flickr/sizes-6k.html?raw';
import asEmbed from '../fixtures/artstation/embed.html?raw';

const mockFetch = (payload: unknown, ok = true) =>
  (async () => ({ ok, json: async () => payload })) as unknown as typeof fetch;

describe('resolveOriginal — twitter', () => {
  it('picks the highest-bitrate mp4 from a real syndication response (fixture)', async () => {
    const url = await resolveOriginal({ platform: 'twitter', id: '123' }, { fetch: mockFetch(tweetResultVideo) });
    expect(url).toEqual({ url: 'https://video.twimg.com/amplify_video/2074974762711785472/vid/avc1/720x708/ENlI2GicSM30_PC_.mp4' });
  });
  it('falls back to the x-mpegURL master from a real live/broadcast syndication response (fixture)', async () => {
    expect(await resolveOriginal({ platform: 'twitter', id: '456' }, { fetch: mockFetch(tweetResultHls) }))
      .toEqual({ url: 'https://video.twimg.com/amplify_video/1799999999999999999/pl/EXAMPLE_MASTER.m3u8?tag=16&container=fmp4', hls: true });
  });
  it('resolves an HLS-only tweet to its x-mpegURL master (twimg-pinned)', async () => {
    const hls = { mediaDetails: [{ video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' }] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(hls) }))
      .toEqual({ url: 'https://video.twimg.com/x.m3u8', hls: true });
  });
  it('falls back to the x-mpegURL master when there is no mp4 variant', async () => {
    const hls = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/live/pl.m3u8' },
    ] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(hls) }))
      .toEqual({ url: 'https://video.twimg.com/live/pl.m3u8', hls: true });
  });
  it('prefers mp4 over the x-mpegURL master when both exist', async () => {
    const both = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/live/pl.m3u8' },
      { content_type: 'video/mp4', bitrate: 9, url: 'https://video.twimg.com/hi.mp4' },
    ] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(both) }))
      .toEqual({ url: 'https://video.twimg.com/hi.mp4' });
  });
  it('rejects an x-mpegURL master on a non-twimg host', async () => {
    const evil = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'application/x-mpegURL', url: 'https://evil.example/x.m3u8' },
    ] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(evil) })).toBeNull();
  });
  it('returns null on a non-ok response', async () => {
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch({}, false) })).toBeNull();
  });
  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: throwing })).toBeNull();
  });
  it('rejects an mp4 variant that is not https twimg.com (untrusted JSON URL)', async () => {
    const evil = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'video/mp4', bitrate: 1, url: 'https://evil.example/x.mp4' },
    ] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(evil) })).toBeNull();
  });
  it('returns null (never throws) when the mp4 url is a malformed string the URL constructor rejects', () => {
    const bad = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'video/mp4', bitrate: 1, url: 'not a url' },
    ] } }] };
    return expect(resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(bad) })).resolves.toBeNull();
  });
  it('returns null for an ok response with no mediaDetails at all', async () => {
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch({}) })).toBeNull();
  });
  it('tolerates a mediaDetails entry with no video_info/variants (still resolves the mp4 from a sibling)', async () => {
    const mixed = { mediaDetails: [
      {},
      { video_info: { variants: [{ content_type: 'video/mp4', bitrate: 5, url: 'https://video.twimg.com/only.mp4' }] } },
    ] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(mixed) }))
      .toEqual({ url: 'https://video.twimg.com/only.mp4' });
  });
  it('keeps the first, higher-bitrate mp4 when a later variant is lower-bitrate (descending order)', async () => {
    const desc = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/hi.mp4' },
      { content_type: 'video/mp4', bitrate: 632000, url: 'https://video.twimg.com/lo.mp4' },
    ] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(desc) }))
      .toEqual({ url: 'https://video.twimg.com/hi.mp4' });
  });
  it('treats an mp4 variant with no bitrate as 0 and still returns it when it is the only mp4', async () => {
    const noBitrate = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'video/mp4', url: 'https://video.twimg.com/nobitrate.mp4' },
    ] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(noBitrate) }))
      .toEqual({ url: 'https://video.twimg.com/nobitrate.mp4' });
  });
  it('falls back to a sibling HLS master, tolerating a video_info-less detail in the HLS loop', async () => {
    const mixed = { mediaDetails: [
      {},
      { video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/live/pl.m3u8' }] } },
    ] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(mixed) }))
      .toEqual({ url: 'https://video.twimg.com/live/pl.m3u8', hls: true });
  });
  it('returns the n-th photo media_url_https at name=orig (fixture)', async () => {
    expect(await resolveOriginal({ platform: 'twitter', id: 'photo 123 1' }, { fetch: mockFetch(tweetResultPhoto) }))
      .toEqual({ url: 'https://pbs.twimg.com/media/PHOTO_A.jpg?name=orig' });
    expect(await resolveOriginal({ platform: 'twitter', id: 'photo 123 3' }, { fetch: mockFetch(tweetResultPhoto) }))
      .toEqual({ url: 'https://pbs.twimg.com/media/PHOTO_C.jpg?name=orig' });
  });
  it('returns null when the indexed media item is a video (video hint handles it)', async () => {
    expect(await resolveOriginal({ platform: 'twitter', id: 'photo 123 2' }, { fetch: mockFetch(tweetResultPhoto) })).toBeNull();
  });
  it('returns null for an out-of-range photo index', async () => {
    expect(await resolveOriginal({ platform: 'twitter', id: 'photo 123 9' }, { fetch: mockFetch(tweetResultPhoto) })).toBeNull();
  });
  it('rejects a photo media_url_https that is not twimg.com', async () => {
    const evil = { mediaDetails: [{ type: 'photo', media_url_https: 'https://evil.example/x.jpg' }] };
    expect(await resolveOriginal({ platform: 'twitter', id: 'photo 1 1' }, { fetch: mockFetch(evil) })).toBeNull();
  });
  it('still resolves a bare-id video hint (back-compat)', async () => {
    const url = await resolveOriginal({ platform: 'twitter', id: '123' }, { fetch: mockFetch(tweetResultVideo) });
    expect(url).toEqual({ url: 'https://video.twimg.com/amplify_video/2074974762711785472/vid/avc1/720x708/ENlI2GicSM30_PC_.mp4' });
  });
});

describe('resolveOriginal — wallhaven', () => {
  it('returns data.path from a real wallhaven API response (fixture)', async () => {
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'gwm2z3' }, { fetch: mockFetch(wallhavenWallpaper) }))
      .toEqual({ url: 'https://w.wallhaven.cc/full/gw/wallhaven-gwm2z3.jpg' });
  });
  it('returns null on 401 (nsfw/unlisted)', async () => {
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'x' }, { fetch: mockFetch({}, false) })).toBeNull();
  });
  it('rejects a data.path pointing off-host (untrusted JSON URL)', async () => {
    const evil = { data: { path: 'https://evil.example/x.png' } };
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'x' }, { fetch: mockFetch(evil) })).toBeNull();
  });
  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'x' }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — unsplash', () => {
  it('returns the /download URL without fetching', async () => {
    let called = false;
    const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    const url = await resolveOriginal({ platform: 'unsplash', id: 'abc123' }, { fetch: spy });
    expect(url).toEqual({ url: 'https://unsplash.com/photos/abc123/download' });
    expect(called).toBe(false);
  });
});

describe('resolveOriginal — vimeo', () => {
  const config = (progressive: unknown[]) => ({ request: { files: { progressive } } });

  it('returns the highest progressive mp4 from a real player config (fixture), pinned to vimeocdn.com', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '76979871' }, { fetch: mockFetch(vimeoConfig) }))
      .toEqual({ url: 'https://vod-progressive-ak.vimeocdn.com/exp=SIG~acl=SIG~hmac=SIG/vimeo-prod/720p.mp4' });
  });

  it('falls back to the default_cdn HLS master from a real HLS/DASH-only config (fixture)', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '76979871' }, { fetch: mockFetch(vimeoHlsConfig) }))
      .toEqual({ url: 'https://vod-adaptive-ak.vimeocdn.com/exp=SIG~acl=SIG~hmac=SIG/vimeo-prod-hls/master.m3u8', hls: true });
  });

  it('returns null when there is no progressive rendition (HLS/DASH-only)', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(config([])) })).toBeNull();
  });

  it('returns null when the config has no progressive key at all (and no HLS)', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch({ request: { files: {} } }) })).toBeNull();
  });

  it('skips a progressive entry that has no url and picks the next valid one', async () => {
    const payload = config([
      { height: 1080 }, // no url — must be skipped, not treated as best
      { height: 720, url: 'https://vod-progressive-ak.vimeocdn.com/a/720.mp4' },
    ]);
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://vod-progressive-ak.vimeocdn.com/a/720.mp4' });
  });

  it('treats a progressive entry with a url but no height as height 0 (still selectable when alone)', async () => {
    const payload = config([{ url: 'https://vod-progressive-ak.vimeocdn.com/a/noheight.mp4' }]);
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://vod-progressive-ak.vimeocdn.com/a/noheight.mp4' });
  });

  it('rejects a progressive URL that is not https vimeocdn.com (untrusted JSON URL)', async () => {
    const evil = config([{ height: 1080, url: 'https://evil.example/x.mp4' }]);
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(evil) })).toBeNull();
  });

  it('returns null on a 403 (domain-locked) config', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch({}, false) })).toBeNull();
  });

  const hlsConfig = (progressive: unknown[], hls: unknown) => ({ request: { files: { progressive, hls } } });

  it('falls back to the default_cdn HLS master when there is no progressive rendition', async () => {
    const payload = hlsConfig([], {
      default_cdn: 'fastly_skyfire',
      cdns: {
        akfire_interconnect_quic: { url: 'https://vod-adaptive-ak.vimeocdn.com/a/akfire.m3u8' },
        fastly_skyfire: { url: 'https://vod-adaptive-ak.vimeocdn.com/a/fastly.m3u8' },
      },
    });
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://vod-adaptive-ak.vimeocdn.com/a/fastly.m3u8', hls: true });
  });

  it('uses the first cdn when default_cdn is missing/unknown', async () => {
    const payload = hlsConfig([], {
      cdns: { only_cdn: { url: 'https://vod-adaptive-ak.vimeocdn.com/a/only.m3u8' } },
    });
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://vod-adaptive-ak.vimeocdn.com/a/only.m3u8', hls: true });
  });

  it('prefers progressive over HLS when both exist', async () => {
    const payload = hlsConfig(
      [{ height: 720, url: 'https://vod-progressive-ak.vimeocdn.com/a/720.mp4' }],
      { default_cdn: 'c', cdns: { c: { url: 'https://vod-adaptive-ak.vimeocdn.com/a/m.m3u8' } } },
    );
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://vod-progressive-ak.vimeocdn.com/a/720.mp4' });
  });

  it('rejects an HLS master that is not https vimeocdn.com (untrusted JSON URL)', async () => {
    const payload = hlsConfig([], { default_cdn: 'c', cdns: { c: { url: 'https://evil.example/x.m3u8' } } });
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(payload) })).toBeNull();
  });

  it('returns null when there is neither a progressive nor an HLS rendition', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(hlsConfig([], undefined)) })).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — dailymotion', () => {
  const meta = (over: Record<string, unknown> = {}) => ({
    qualities: {
      auto: [{ type: 'application/x-mpegURL', url: 'https://cdndirector.dailymotion.com/cdn/manifest/video/x8pp4d0.m3u8?sec=X' }],
    },
    ...over,
  });

  it('returns the qualities.auto HLS master, pinned to dailymotion.com', async () => {
    expect(await resolveOriginal({ platform: 'dailymotion', id: 'x8pp4d0' }, { fetch: mockFetch(meta()) }))
      .toEqual({ url: 'https://cdndirector.dailymotion.com/cdn/manifest/video/x8pp4d0.m3u8?sec=X', hls: true });
  });

  it('returns null for a DRM/geo-locked video (protected_delivery)', async () => {
    expect(await resolveOriginal({ platform: 'dailymotion', id: 'x8pp4d0' }, { fetch: mockFetch(meta({ protected_delivery: true })) })).toBeNull();
  });

  it('returns null on a non-200 metadata response', async () => {
    expect(await resolveOriginal({ platform: 'dailymotion', id: 'x8pp4d0' }, { fetch: mockFetch({}, false) })).toBeNull();
  });

  it('returns null when the master host is not dailymotion.com (host-pin)', async () => {
    const evil = meta({ qualities: { auto: [{ type: 'application/x-mpegURL', url: 'https://evil.example.com/x.m3u8' }] } });
    expect(await resolveOriginal({ platform: 'dailymotion', id: 'x8pp4d0' }, { fetch: mockFetch(evil) })).toBeNull();
  });

  it('returns null when there is no auto quality', async () => {
    expect(await resolveOriginal({ platform: 'dailymotion', id: 'x8pp4d0' }, { fetch: mockFetch(meta({ qualities: { auto: [] } })) })).toBeNull();
  });
});

describe('resolveOriginal — rutube', () => {
  const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const MASTER = `https://bl.rutube.ru/route/${ID}.m3u8?guids=x,y`;
  const opts = (over: Record<string, unknown> = {}) => ({ video_balancer: { m3u8: MASTER, default: MASTER }, ...over });

  it('returns the video_balancer HLS master, pinned to rutube.ru', async () => {
    expect(await resolveOriginal({ platform: 'rutube', id: ID }, { fetch: mockFetch(opts()) }))
      .toEqual({ url: MASTER, hls: true });
  });

  it('returns null on a non-hex id (never fetches)', async () => {
    expect(await resolveOriginal({ platform: 'rutube', id: 'not-a-hex-id' }, { fetch: mockFetch(opts()) })).toBeNull();
  });

  it('returns null on a non-200 API response', async () => {
    expect(await resolveOriginal({ platform: 'rutube', id: ID }, { fetch: mockFetch({}, false) })).toBeNull();
  });

  it('returns null when the master host is not rutube.ru (host-pin)', async () => {
    const evil = { video_balancer: { m3u8: 'https://evil.example.com/x.m3u8' } };
    expect(await resolveOriginal({ platform: 'rutube', id: ID }, { fetch: mockFetch(evil) })).toBeNull();
  });

  it('returns null when there is no balancer master', async () => {
    expect(await resolveOriginal({ platform: 'rutube', id: ID }, { fetch: mockFetch({ video_balancer: {} }) })).toBeNull();
  });
});

describe('resolveOriginal — rumble', () => {
  const EMBED = 'v7ab6sc';
  const MASTER = 'https://rumble.com/hls-vod/7ab6sc/playlist.m3u8';
  const embedJs = (hls: string | undefined = MASTER) => ({ ua: { hls: { auto: { url: hls } } } });
  const oembed = { html: `<iframe src="https://rumble.com/embed/${EMBED}/?pub=4"></iframe>` };
  const seqFetch = (route: (url: string) => { ok?: boolean; payload: unknown }) =>
    (async (input: unknown) => {
      const { ok = true, payload } = route(String(input));
      return { ok, json: async () => payload };
    }) as unknown as typeof fetch;

  it('derives the embed id via oEmbed, then returns the embedJS HLS master (rumble.com-pinned)', async () => {
    const fetch = seqFetch((url) =>
      url.includes('/api/Media/oembed.json') ? { payload: oembed }
        : url.includes('/embedJS/') ? { payload: embedJs() }
          : { ok: false, payload: {} });
    expect(await resolveOriginal({ platform: 'rumble', id: 'https://rumble.com/v7chusk-x.html' }, { fetch }))
      .toEqual({ url: MASTER, hls: true });
  });

  it('skips oEmbed when the hint is already an /embed/<id>/ URL', async () => {
    let oembedCalls = 0;
    const fetch = seqFetch((url) => {
      if (url.includes('/api/Media/oembed.json')) { oembedCalls++; return { payload: oembed }; }
      return { payload: embedJs() };
    });
    expect(await resolveOriginal({ platform: 'rumble', id: 'https://rumble.com/embed/v7ab6sc/' }, { fetch }))
      .toEqual({ url: MASTER, hls: true });
    expect(oembedCalls).toBe(0);
  });

  it('accepts an off-rumble.com CDN master on the allowlist (1a-1791.com)', async () => {
    const fetch = seqFetch(() => ({ payload: embedJs('https://1a-1791.com/hls/master.m3u8') }));
    expect(await resolveOriginal({ platform: 'rumble', id: 'https://rumble.com/embed/v7ab6sc/' }, { fetch }))
      .toEqual({ url: 'https://1a-1791.com/hls/master.m3u8', hls: true });
  });

  it('returns null when the hint URL is not rumble.com (SSRF pin, never fetches)', async () => {
    let calls = 0;
    const fetch = seqFetch(() => { calls++; return { payload: embedJs() }; });
    expect(await resolveOriginal({ platform: 'rumble', id: 'https://evil.example.com/v7chusk-x.html' }, { fetch })).toBeNull();
    expect(calls).toBe(0);
  });

  it('returns null when the HLS master host is off-allowlist', async () => {
    const fetch = seqFetch(() => ({ payload: embedJs('https://evil.example.com/master.m3u8') }));
    expect(await resolveOriginal({ platform: 'rumble', id: 'https://rumble.com/embed/v7ab6sc/' }, { fetch })).toBeNull();
  });

  it('returns null when embedJS carries no HLS master', async () => {
    const fetch = seqFetch(() => ({ payload: { ua: {} } }));
    expect(await resolveOriginal({ platform: 'rumble', id: 'https://rumble.com/embed/v7ab6sc/' }, { fetch })).toBeNull();
  });

  it('returns null when oEmbed html carries no embed id', async () => {
    const fetch = seqFetch((url) =>
      url.includes('oembed') ? { payload: { html: '<iframe src="https://rumble.com/nope"></iframe>' } } : { payload: embedJs() });
    expect(await resolveOriginal({ platform: 'rumble', id: 'https://rumble.com/v7chusk-x.html' }, { fetch })).toBeNull();
  });
});

describe('resolveOriginal — peertube', () => {
  const UUID = '9c9de5e8-0a1e-484a-b099-e80766180a6d';
  const EMBED = `https://framatube.org/videos/embed/${UUID}`;
  const CONFIG = { serverVersion: '8.2.2' };
  const detail = (over: Record<string, unknown> = {}) => ({
    streamingPlaylists: [{
      playlistUrl: 'https://media.tube.example/hls/master.m3u8',
      files: [
        { resolution: { id: 480 }, fileUrl: 'https://media.tube.example/hls/480.mp4' },
        { resolution: { id: 1080 }, fileUrl: 'https://media.tube.example/hls/1080.mp4' },
      ],
    }],
    files: [{ resolution: { id: 720 }, fileUrl: 'https://framatube.org/static/720.mp4' }],
    ...over,
  });
  const seqFetch = (route: (url: string) => { ok?: boolean; payload: unknown }) =>
    (async (input: unknown) => {
      const { ok = true, payload } = route(String(input));
      return { ok, json: async () => payload };
    }) as unknown as typeof fetch;
  const route = (over?: (url: string) => { ok?: boolean; payload: unknown } | null) =>
    seqFetch((url) => {
      const o = over?.(url);
      if (o) return o;
      return url.includes('/api/v1/config') ? { payload: CONFIG } : { payload: detail() };
    });

  it('returns the widest direct file across the HLS + progressive lists (host-agnostic)', async () => {
    expect(await resolveOriginal({ platform: 'peertube', id: EMBED }, { fetch: route() }))
      .toEqual({ url: 'https://media.tube.example/hls/1080.mp4' });
  });

  it('falls back to fileDownloadUrl when a file has no fileUrl', async () => {
    const fetch = route((url) => url.includes('/videos/')
      ? { payload: { files: [{ resolution: { id: 1080 }, fileDownloadUrl: 'https://framatube.org/download/1080.mp4' }] } }
      : null);
    expect(await resolveOriginal({ platform: 'peertube', id: EMBED }, { fetch }))
      .toEqual({ url: 'https://framatube.org/download/1080.mp4' });
  });

  it('falls back to the HLS master when no direct file is exposed', async () => {
    const fetch = route((url) => url.includes('/videos/')
      ? { payload: { streamingPlaylists: [{ playlistUrl: 'https://media.tube.example/hls/master.m3u8', files: [] }], files: [] } }
      : null);
    expect(await resolveOriginal({ platform: 'peertube', id: EMBED }, { fetch }))
      .toEqual({ url: 'https://media.tube.example/hls/master.m3u8', hls: true });
  });

  it('returns null (and never fetches the video) when /api/v1/config is not PeerTube', async () => {
    let videoCalls = 0;
    const fetch = seqFetch((url) => {
      if (url.includes('/api/v1/config')) return { payload: {} };
      videoCalls++; return { payload: detail() };
    });
    expect(await resolveOriginal({ platform: 'peertube', id: EMBED }, { fetch })).toBeNull();
    expect(videoCalls).toBe(0);
  });

  it('returns null on a private video (video fetch not ok)', async () => {
    const fetch = route((url) => url.includes('/videos/') ? { ok: false, payload: {} } : null);
    expect(await resolveOriginal({ platform: 'peertube', id: EMBED }, { fetch })).toBeNull();
  });

  it('returns null without fetching when the instance host is internal (SSRF)', async () => {
    let calls = 0;
    const fetch = seqFetch(() => { calls++; return { payload: CONFIG }; });
    expect(await resolveOriginal({ platform: 'peertube', id: `https://169.254.169.254/videos/embed/${UUID}` }, { fetch })).toBeNull();
    expect(calls).toBe(0);
  });

  it('rejects a media URL that resolves to an internal host (returned-URL SSRF)', async () => {
    const fetch = route((url) => url.includes('/videos/')
      ? { payload: { files: [{ resolution: { id: 720 }, fileUrl: 'https://127.0.0.1/secret.mp4' }] } }
      : null);
    expect(await resolveOriginal({ platform: 'peertube', id: EMBED }, { fetch })).toBeNull();
  });

  it('returns null on a hint URL that is not an /videos/embed/ shape (never fetches)', async () => {
    let calls = 0;
    const fetch = seqFetch(() => { calls++; return { payload: CONFIG }; });
    expect(await resolveOriginal({ platform: 'peertube', id: 'https://framatube.org/about' }, { fetch })).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('resolveOriginal — loom', () => {
  const ID = '473fad25ebd24b5ea8091503253dfecf';
  const MP4 = 'https://cdn.loom.com/sessions/transcoded/473fad25-1784350318000.mp4?Policy=x&Signature=y&Key-Pair-Id=z';
  const HLS = 'https://luna.loom.com/id/473fad25/rev/abc123/resource/hls/playlist-split.m3u8';
  const seqFetch = (route: (url: string) => { ok?: boolean; status?: number; payload: unknown }) =>
    (async (input: unknown) => {
      const { ok = true, status = 200, payload } = route(String(input));
      return { ok, status, json: async () => payload };
    }) as unknown as typeof fetch;

  it('returns the transcoded cdn.loom.com mp4 (loom.com-pinned)', async () => {
    const fetch = seqFetch((u) => u.includes('/transcoded-url') ? { payload: { url: MP4 } } : { ok: false, payload: {} });
    expect(await resolveOriginal({ platform: 'loom', id: ID }, { fetch })).toEqual({ url: MP4 });
  });

  it('falls back to the raw luna.loom.com HLS master on a 204 transcoded response', async () => {
    let rawCalled = false;
    const fetch = seqFetch((u) => {
      if (u.includes('/transcoded-url')) return { status: 204, payload: {} };
      rawCalled = true; return { payload: { url: HLS } };
    });
    expect(await resolveOriginal({ platform: 'loom', id: ID }, { fetch })).toEqual({ url: HLS, hls: true });
    expect(rawCalled).toBe(true);
  });

  it('returns null on a non-hex id (never fetches)', async () => {
    let calls = 0;
    const fetch = seqFetch(() => { calls++; return { payload: { url: MP4 } }; });
    expect(await resolveOriginal({ platform: 'loom', id: 'not-a-hex-id' }, { fetch })).toBeNull();
    expect(calls).toBe(0);
  });

  it('returns null when the transcoded mp4 host is not loom.com (pin)', async () => {
    const fetch = seqFetch((u) => u.includes('/transcoded-url')
      ? { payload: { url: 'https://evil.example.com/x.mp4' } }
      : { ok: false, payload: {} });
    expect(await resolveOriginal({ platform: 'loom', id: ID }, { fetch })).toBeNull();
  });

  it('returns null when the loom is restricted (both endpoints 403)', async () => {
    const fetch = seqFetch(() => ({ ok: false, status: 403, payload: {} }));
    expect(await resolveOriginal({ platform: 'loom', id: ID }, { fetch })).toBeNull();
  });
});

describe('resolveOriginal — bsky (getBlob)', () => {
  const pdsDoc = {
    service: [
      { id: '#atproto_label', type: 'AtprotoLabeler', serviceEndpoint: 'https://labeler.example' },
      { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://puffball.us-east.host.bsky.network' },
    ],
  };
  const capturingFetch = (payload: unknown, ok = true) => {
    const calls: string[] = [];
    const fn = (async (u: string) => { calls.push(String(u)); return { ok, json: async () => payload }; }) as unknown as typeof fetch;
    return Object.assign(fn, { calls });
  };

  it('did:plc — resolves the PDS via plc.directory and builds the getBlob URL (real DID doc fixture)', async () => {
    const fetch = capturingFetch(bskyDidDoc);
    const out = await resolveOriginal({ platform: 'bsky', id: 'blob did:plc:z72i7hd bafblobcid' }, { fetch });
    expect(fetch.calls).toEqual(['https://plc.directory/did%3Aplc%3Az72i7hd']);
    expect(out).toEqual({
      url: 'https://puffball.us-east.host.bsky.network/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Az72i7hd&cid=bafblobcid',
    });
  });

  it('did:web — resolves the PDS via /.well-known/did.json', async () => {
    const fetch = capturingFetch(pdsDoc);
    const out = await resolveOriginal({ platform: 'bsky', id: 'blob did:web:example.com bafblobcid' }, { fetch });
    expect(fetch.calls).toEqual(['https://example.com/.well-known/did.json']);
    expect(out).toEqual({
      url: 'https://puffball.us-east.host.bsky.network/xrpc/com.atproto.sync.getBlob?did=did%3Aweb%3Aexample.com&cid=bafblobcid',
    });
  });

  it('did:web — resolves the PDS from a real .well-known DID document (fixture)', async () => {
    const fetch = capturingFetch(bskyDidWebDoc);
    const out = await resolveOriginal({ platform: 'bsky', id: 'blob did:web:example.com bafblobcid' }, { fetch });
    expect(fetch.calls).toEqual(['https://example.com/.well-known/did.json']);
    expect(out).toEqual({
      url: 'https://morel.us-east.host.bsky.network/xrpc/com.atproto.sync.getBlob?did=did%3Aweb%3Aexample.com&cid=bafblobcid',
    });
  });

  it('picks the PDS entry among multiple services (by type / #atproto_pds id)', async () => {
    const fetch = capturingFetch(pdsDoc);
    const out = await resolveOriginal({ platform: 'bsky', id: 'blob did:plc:abc cid' }, { fetch });
    expect(out?.url).toContain('https://puffball.us-east.host.bsky.network/xrpc/com.atproto.sync.getBlob');
  });

  it('rejects a non-https PDS serviceEndpoint', async () => {
    const doc = { service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'http://insecure.example' }] };
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:plc:abc cid' }, { fetch: mockFetch(doc) })).toBeNull();
  });

  it('returns null when the DID doc has no PDS service', async () => {
    const doc = { service: [{ id: '#atproto_label', type: 'AtprotoLabeler', serviceEndpoint: 'https://labeler.example' }] };
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:plc:abc cid' }, { fetch: mockFetch(doc) })).toBeNull();
  });

  it('returns null on a non-ok DID-doc response', async () => {
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:plc:abc cid' }, { fetch: mockFetch({}, false) })).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:plc:abc cid' }, { fetch: throwing })).toBeNull();
  });

  it('returns null for an unsupported DID method, without fetching', async () => {
    const fetch = capturingFetch(pdsDoc);
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:key:zabc cid' }, { fetch })).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it('returns null for a did:web with a non-bare host (port/path), without fetching', async () => {
    const fetch = capturingFetch(pdsDoc);
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:web:evil.example:1234 cid' }, { fetch })).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it.each([
    'did:web:169.254.169.254', // link-local (cloud metadata)
    'did:web:localhost',
    'did:web:127.0.0.1',
    'did:web:10.0.0.1', // private
    'did:web:2130706433', // decimal-encoded 127.0.0.1
  ])('blocks did:web pointing at an internal host (%s), without fetching', async (did) => {
    const fetch = capturingFetch(pdsDoc);
    expect(await resolveOriginal({ platform: 'bsky', id: `blob ${did} bafcid` }, { fetch })).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it('blocks a did:web whose DID document serviceEndpoint points at an internal host', async () => {
    const fetch = capturingFetch({
      service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://169.254.169.254' }],
    });
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:web:example.com bafcid' }, { fetch })).toBeNull();
  });

  it('returns null for a malformed hint id (wrong part count), without fetching', async () => {
    const fetch = capturingFetch(pdsDoc);
    expect(await resolveOriginal({ platform: 'bsky', id: 'blob did:plc:abc' }, { fetch })).toBeNull();
    expect(fetch.calls).toEqual([]);
  });
});

describe('resolveOriginal — bsky (video)', () => {
  it('builds the video.bsky.app HLS playlist from a video hint, without fetching', async () => {
    let called = false;
    const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    const out = await resolveOriginal({ platform: 'bsky', id: 'video did:plc:z72i7hd bafvideocid' }, { fetch: spy });
    expect(out).toEqual({
      url: 'https://video.bsky.app/watch/did%3Aplc%3Az72i7hd/bafvideocid/playlist.m3u8',
      hls: true,
    });
    expect(called).toBe(false);
  });

  it('encodes a did:web account id in the playlist path', async () => {
    const spy = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    const out = await resolveOriginal({ platform: 'bsky', id: 'video did:web:example.com bafvideocid' }, { fetch: spy });
    expect(out).toEqual({
      url: 'https://video.bsky.app/watch/did%3Aweb%3Aexample.com/bafvideocid/playlist.m3u8',
      hls: true,
    });
  });
});

describe('resolveOriginal — sankaku', () => {
  const ORIG = 'https://v.sankakucomplex.com/data/26/20/2620d86cb72802a5dcd9e1e189b75e64.jpg?e=1&expires=1&m=a&token=b';
  const detail = (fileUrl?: string) => ({ success: true, data: { file_url: fileUrl } });

  it('returns the signed file_url from the detail endpoint, pinned to sankakucomplex.com', async () => {
    expect(await resolveOriginal({ platform: 'sankaku', id: 'vkr3E7Yo8MZ' }, { fetch: mockFetch(detail(ORIG)) }))
      .toEqual({ url: ORIG });
  });

  it('sends credentials:include (cookie-first, no token handling)', async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => detail(ORIG) }));
    await resolveOriginal({ platform: 'sankaku', id: 'vkr3E7Yo8MZ' }, { fetch: spy as unknown as typeof fetch });
    expect(((spy.mock.calls[0] as unknown[]) || [])[1] as RequestInit | undefined).toBeDefined();
    expect((((spy.mock.calls[0] as unknown[]) || [])[1] as RequestInit | undefined)?.credentials).toBe('include');
  });

  it('returns null on a non-ok response (401/403 — auth unavailable) without throwing', async () => {
    expect(await resolveOriginal({ platform: 'sankaku', id: 'vkr3E7Yo8MZ' }, { fetch: mockFetch(detail(ORIG), false) })).toBeNull();
  });

  it('rejects a file_url that is not https sankakucomplex.com (untrusted JSON)', async () => {
    expect(await resolveOriginal({ platform: 'sankaku', id: 'vkr3E7Yo8MZ' }, { fetch: mockFetch(detail('https://evil.example/x.jpg')) })).toBeNull();
  });

  it('returns null for a bad id or a missing file_url', async () => {
    expect(await resolveOriginal({ platform: 'sankaku', id: 'bad id!' }, { fetch: mockFetch(detail(ORIG)) })).toBeNull();
    expect(await resolveOriginal({ platform: 'sankaku', id: 'vkr3E7Yo8MZ' }, { fetch: mockFetch({ success: true, data: {} }) })).toBeNull();
  });
});

describe('resolveOriginal — unknown platform', () => {
  it('returns null for a platform with no resolver (default case), without fetching', async () => {
    let called = false;
    const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    const unknownHint = { platform: 'facebook', id: 'x' } as unknown as Parameters<typeof resolveOriginal>[0];
    expect(await resolveOriginal(unknownHint, { fetch: spy })).toBeNull();
    expect(called).toBe(false);
  });
});

describe('resolveOriginal — id injection is neutralized', () => {
  const capture = () => {
    const urls: string[] = [];
    const fetch = (async (u: string) => {
      urls.push(u);
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof globalThis.fetch;
    return { urls, fetch };
  };

  it('percent-encodes a hostile twitter id into the syndication query (no path/host/param escape)', async () => {
    const { urls, fetch } = capture();
    const hostile = '123/../../evil?token=leak&x';
    await resolveOriginal({ platform: 'twitter', id: hostile }, { fetch });
    expect(new URL(urls[0]).hostname).toBe('cdn.syndication.twimg.com');
    expect(urls[0]).toContain(`id=${encodeURIComponent(hostile)}`);
    expect(urls[0]).not.toContain('123/../../evil');
  });

  it('percent-encodes a hostile wallhaven id into the API path', async () => {
    const { urls, fetch } = capture();
    await resolveOriginal({ platform: 'wallhaven', id: '../../secret' }, { fetch });
    expect(new URL(urls[0]).hostname).toBe('wallhaven.cc');
    expect(urls[0]).toContain(encodeURIComponent('../../secret'));
    expect(urls[0]).not.toContain('/w/../../secret');
  });

  it('percent-encodes a hostile unsplash id into the download path', async () => {
    const spy = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    const res = await resolveOriginal({ platform: 'unsplash', id: '../../@evil' }, { fetch: spy });
    expect(res).toEqual({ url: `https://unsplash.com/photos/${encodeURIComponent('../../@evil')}/download` });
    expect((res as { url: string }).url).not.toContain('/photos/../../');
  });
});

describe('resolveOriginal — flickr (keyless /sizes/ scrape)', () => {
  const ID = '55379291849';
  const CANON = `https://www.flickr.com/photos/31779113@N06/${ID}/`;
  const flickrFetch = (o: { gneOk?: boolean; canonical?: string; sizesOk?: boolean; sizesUrl?: string; body?: string } = {}) => {
    const calls: string[] = [];
    const fn = (async (u: string) => {
      calls.push(String(u));
      if (String(u).includes('photo.gne')) return { ok: o.gneOk ?? true, url: o.canonical ?? CANON };
      return { ok: o.sizesOk ?? true, url: o.sizesUrl ?? `${CANON}sizes/6k/`, text: async () => o.body ?? flickrSizesHtml };
    }) as unknown as typeof fetch;
    return Object.assign(fn, { calls });
  };

  it('recovers the largest (6k) URL — with its different secret — from the real /sizes/ page', async () => {
    const fetch = flickrFetch();
    const out = await resolveOriginal({ platform: 'flickr', id: ID }, { fetch });
    expect(out).toEqual({ url: `https://live.staticflickr.com/65535/${ID}_3d3e638f8b_6k.jpg` });
    expect(fetch.calls[0]).toBe(`https://www.flickr.com/photo.gne?id=${ID}`);
    expect(fetch.calls[1]).toBe(`https://www.flickr.com/photos/31779113@N06/${ID}/sizes/`);
  });

  it('returns null for a non-numeric id without fetching', async () => {
    const fetch = flickrFetch();
    expect(await resolveOriginal({ platform: 'flickr', id: '../evil' }, { fetch })).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it('rejects a photo.gne redirect to a non-flickr host (open-redirect guard)', async () => {
    const fetch = flickrFetch({ canonical: `https://evil.example/photos/x/${ID}/` });
    expect(await resolveOriginal({ platform: 'flickr', id: ID }, { fetch })).toBeNull();
  });

  it('rejects a canonical whose path is not this photo id', async () => {
    const fetch = flickrFetch({ canonical: 'https://www.flickr.com/photos/x/99999/' });
    expect(await resolveOriginal({ platform: 'flickr', id: ID }, { fetch })).toBeNull();
  });

  it('returns null when the /sizes/ final URL has no size code', async () => {
    const fetch = flickrFetch({ sizesUrl: CANON });
    expect(await resolveOriginal({ platform: 'flickr', id: ID }, { fetch })).toBeNull();
  });

  it('returns null when the page has no matching staticflickr URL for that size', async () => {
    const fetch = flickrFetch({ body: '<div>no image here</div>' });
    expect(await resolveOriginal({ platform: 'flickr', id: ID }, { fetch })).toBeNull();
  });

  it('returns null on a non-ok photo.gne response', async () => {
    const fetch = flickrFetch({ gneOk: false });
    expect(await resolveOriginal({ platform: 'flickr', id: ID }, { fetch })).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'flickr', id: ID }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — reddit (deterministic HLS master)', () => {
  const noFetch = (async () => { throw new Error('reddit must not fetch'); }) as unknown as typeof fetch;

  it('builds the signature-free v.redd.it HLS master from the id, without fetching', async () => {
    const out = await resolveOriginal({ platform: 'reddit', id: '8tnc0d8mu3ch1' }, { fetch: noFetch });
    expect(out).toEqual({ url: 'https://v.redd.it/8tnc0d8mu3ch1/HLSPlaylist.m3u8', hls: true });
  });

  it('derives the v.redd.it id from a real media.reddit_video shape (fixture) and yields its audio-muxable master', async () => {
    const id = redditVideo.media.reddit_video.fallback_url.match(/v\.redd\.it\/([a-z0-9]+)\//i)?.[1] ?? '';
    expect(id).toBe('8tnc0d8mu3ch1');
    expect(await resolveOriginal({ platform: 'reddit', id }, { fetch: noFetch }))
      .toEqual({ url: 'https://v.redd.it/8tnc0d8mu3ch1/HLSPlaylist.m3u8', hls: true });
  });

  it('rejects an id with non [a-z0-9] characters (path-injection guard)', async () => {
    expect(await resolveOriginal({ platform: 'reddit', id: '../evil' }, { fetch: noFetch })).toBeNull();
    expect(await resolveOriginal({ platform: 'reddit', id: 'a/b' }, { fetch: noFetch })).toBeNull();
    expect(await resolveOriginal({ platform: 'reddit', id: '' }, { fetch: noFetch })).toBeNull();
  });
});

describe('resolveOriginal — pinterest (pin-widget)', () => {
  const capturingFetch = (payload: unknown, ok = true) => {
    const calls: string[] = [];
    const fn = (async (u: string) => { calls.push(String(u)); return { ok, json: async () => payload }; }) as unknown as typeof fetch;
    return Object.assign(fn, { calls });
  };
  const listOnly = (video_list: Record<string, { url: string }>) => ({ data: [{ videos: { video_list } }] });

  it('queries the public widget endpoint with the pin id', async () => {
    const fetch = capturingFetch(pinWidget);
    await resolveOriginal({ platform: 'pinterest', id: '84301824269690044' }, { fetch });
    expect(fetch.calls).toEqual(['https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=84301824269690044']);
  });

  it('prefers the progressive V_720P mp4 over the HLS renditions (real fixture)', async () => {
    const out = await resolveOriginal({ platform: 'pinterest', id: '84301824269690044' }, { fetch: mockFetch(pinWidget) });
    expect(out).toEqual({ url: 'https://v1.pinimg.com/videos/iht/720p/62/b7/a5/62b7a5ecc1b483e99a3456ef9c2f7861.mp4' });
  });

  it('falls back to the V_HLSV4 master for a real HLS-only pin with no progressive rendition (fixture)', async () => {
    const out = await resolveOriginal({ platform: 'pinterest', id: '1069579883656016853' }, { fetch: mockFetch(pinHlsWidget) });
    expect(out).toEqual({ url: 'https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/aabbccddeeff00112233445566778899.m3u8', hls: true });
  });

  it('falls back to the V_HLSV4 master when there is no progressive mp4', async () => {
    const payload = listOnly({ V_HLSV4: { url: 'https://v1.pinimg.com/videos/iht/hls/aa/bb/cc/deadbeef.m3u8' } });
    const out = await resolveOriginal({ platform: 'pinterest', id: '123' }, { fetch: mockFetch(payload) });
    expect(out).toEqual({ url: 'https://v1.pinimg.com/videos/iht/hls/aa/bb/cc/deadbeef.m3u8', hls: true });
  });

  it('falls back to V_HLSV3_MOBILE when it is the only rendition', async () => {
    const payload = listOnly({ V_HLSV3_MOBILE: { url: 'https://v1.pinimg.com/videos/iht/hls/aa/bb/cc/deadbeef.m3u8' } });
    const out = await resolveOriginal({ platform: 'pinterest', id: '123' }, { fetch: mockFetch(payload) });
    expect(out).toEqual({ url: 'https://v1.pinimg.com/videos/iht/hls/aa/bb/cc/deadbeef.m3u8', hls: true });
  });

  it('rejects a video url that is not on the pinimg.com host family', async () => {
    const payload = listOnly({ V_720P: { url: 'https://evil.example/x.mp4' } });
    expect(await resolveOriginal({ platform: 'pinterest', id: '123' }, { fetch: mockFetch(payload) })).toBeNull();
  });

  it('returns null for a still pin (no video_list)', async () => {
    expect(await resolveOriginal({ platform: 'pinterest', id: '123' }, { fetch: mockFetch({ data: [{}] }) })).toBeNull();
  });

  it('returns null on an empty data array (private / deleted pin)', async () => {
    expect(await resolveOriginal({ platform: 'pinterest', id: '123' }, { fetch: mockFetch({ data: [] }) })).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    expect(await resolveOriginal({ platform: 'pinterest', id: '123' }, { fetch: mockFetch({}, false) })).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'pinterest', id: '123' }, { fetch: throwing })).toBeNull();
  });

  it('returns null for a non-numeric pin id, without fetching', async () => {
    const fetch = capturingFetch(pinWidget);
    expect(await resolveOriginal({ platform: 'pinterest', id: '../evil' }, { fetch })).toBeNull();
    expect(fetch.calls).toEqual([]);
  });
});

describe('resolveOriginal — artstation (keyless /4k/ + video)', () => {
  const LARGE = 'https://cdna.artstation.com/p/assets/images/images/100/627/266/large/x.jpg';
  const headers = (ct: string | null) => ({ get: (h: string) => (h.toLowerCase() === 'content-type' ? ct : null) });
  const asFetch = (o: { imgOk?: boolean; imgCt?: string | null; projOk?: boolean; proj?: unknown; embedOk?: boolean; embed?: string } = {}) => {
    const calls: string[] = [];
    const fn = (async (u: string) => {
      const s = String(u); calls.push(s);
      if (s.includes('/projects/')) return { ok: o.projOk ?? true, json: async () => o.proj ?? asProject };
      if (s.includes('embed.html')) return { ok: o.embedOk ?? true, text: async () => o.embed ?? asEmbed };
      return { ok: o.imgOk ?? true, headers: headers(o.imgCt ?? 'image/jpeg') };
    }) as unknown as typeof fetch;
    return Object.assign(fn, { calls });
  };

  it('img: probes the /4k/ sibling and returns it on an ok image response', async () => {
    const fetch = asFetch();
    const out = await resolveOriginal({ platform: 'artstation', id: `img ${LARGE}` }, { fetch });
    expect(out).toEqual({ url: LARGE.replace('/large/', '/4k/') });
    expect(fetch.calls[0]).toBe(LARGE.replace('/large/', '/4k/'));
  });

  it('img: returns null when /4k/ 404s (asset has no 4k) so the /large/ image stands', async () => {
    expect(await resolveOriginal({ platform: 'artstation', id: `img ${LARGE}` }, { fetch: asFetch({ imgOk: false }) })).toBeNull();
  });

  it('img: returns null when the /4k/ response is not an image (an HTML error page)', async () => {
    expect(await resolveOriginal({ platform: 'artstation', id: `img ${LARGE}` }, { fetch: asFetch({ imgCt: 'text/html' }) })).toBeNull();
  });

  it('img: rejects a /large/ URL that is not on the artstation.com host family', async () => {
    const evil = 'https://evil.example/p/assets/images/images/1/2/3/large/x.jpg';
    expect(await resolveOriginal({ platform: 'artstation', id: `img ${evil}` }, { fetch: asFetch() })).toBeNull();
  });

  it('vid: reads the project JSON, follows the clip embed, and returns the largest mp4 (real fixtures)', async () => {
    const fetch = asFetch();
    const out = await resolveOriginal({ platform: 'artstation', id: 'vid V25orP' }, { fetch });
    expect(out).toEqual({ url: 'https://cdn.artstation.com/p/video_sources/003/353/339/v03-1.mp4' });
    expect(fetch.calls[0]).toBe('https://www.artstation.com/projects/V25orP.json');
  });

  it('vid: returns null for a project with no video_clip asset', async () => {
    const proj = { assets: [{ asset_type: 'image', player_embedded: '' }] };
    expect(await resolveOriginal({ platform: 'artstation', id: 'vid V25orP' }, { fetch: asFetch({ proj }) })).toBeNull();
  });

  it('vid: returns null for a hash with unexpected characters, without fetching', async () => {
    const fetch = asFetch();
    expect(await resolveOriginal({ platform: 'artstation', id: 'vid ../evil' }, { fetch })).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it('vid: returns null on a non-ok project response', async () => {
    expect(await resolveOriginal({ platform: 'artstation', id: 'vid V25orP' }, { fetch: asFetch({ projOk: false }) })).toBeNull();
  });

  it('vid: returns null when the embed has no mp4 source', async () => {
    expect(await resolveOriginal({ platform: 'artstation', id: 'vid V25orP' }, { fetch: asFetch({ embed: '<video></video>' }) })).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'artstation', id: `img ${LARGE}` }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — gallery-page (#287)', () => {
  const PAGE = 'https://booru.example/post/123';
  const htmlFetch = (html: string, ok = true) =>
    (async () => ({ ok, text: async () => html })) as unknown as typeof fetch;
  const resolve = (html: string, ok = true, id = PAGE) =>
    resolveOriginal({ platform: 'gallery-page', id }, { fetch: htmlFetch(html, ok) });

  it('extracts og:image (property-before-content)', async () => {
    const r = await resolve('<meta property="og:image" content="https://cdn.example/full/123.jpg">');
    expect(r).toEqual({ url: 'https://cdn.example/full/123.jpg' });
  });

  it('extracts og:image (content-before-property order)', async () => {
    const r = await resolve('<meta content="https://cdn.example/full/9.png" property="og:image" />');
    expect(r).toEqual({ url: 'https://cdn.example/full/9.png' });
  });

  it('falls back to twitter:image, then link rel=image_src, then largest <img>', async () => {
    expect(await resolve('<meta name="twitter:image" content="https://cdn.example/t.jpg">'))
      .toEqual({ url: 'https://cdn.example/t.jpg' });
    expect(await resolve('<link rel="image_src" href="https://cdn.example/ls.jpg">'))
      .toEqual({ url: 'https://cdn.example/ls.jpg' });
    expect(await resolve('<img src="https://cdn.example/small.jpg" width="80"><img src="https://cdn.example/big.jpg" width="1600">'))
      .toEqual({ url: 'https://cdn.example/big.jpg' });
  });

  it('resolves a relative image URL against the page URL', async () => {
    const r = await resolve('<meta property="og:image" content="/media/orig/123.jpg">');
    expect(r).toEqual({ url: 'https://booru.example/media/orig/123.jpg' });
  });

  it('strips query tokens from the extracted URL', async () => {
    const r = await resolve('<meta property="og:image" content="https://cdn.example/x.jpg?token=SECRET&w=1600">');
    expect(r!.url).toContain('w=1600');
    expect(r!.url).not.toContain('SECRET');
  });

  it('returns null on a non-ok fetch or when no image is found', async () => {
    expect(await resolve('<meta property="og:image" content="https://cdn.example/x.jpg">', false)).toBeNull();
    expect(await resolve('<p>no images here</p>')).toBeNull();
  });

  it('refuses an SSRF page URL and an SSRF-pointing extracted image', async () => {
    expect(await resolve('<meta property="og:image" content="https://cdn.example/x.jpg">', true, 'http://localhost/post/1')).toBeNull();
    expect(await resolve('<meta property="og:image" content="http://169.254.169.254/latest">')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'gallery-page', id: PAGE }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — streamable', () => {
  it('returns the progressive mp4 (files.mp4.url), pinned to .streamable.com', async () => {
    const payload = { files: { mp4: { url: 'https://cdn-cf-east.streamable.com/video/mp4/moo9j0.mp4?Expires=1&Signature=X' }, 'mp4-mobile': { url: 'https://cdn-cf-east.streamable.com/video/mp4-mobile/moo9j0.mp4' } } };
    expect(await resolveOriginal({ platform: 'streamable', id: 'moo9j0' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://cdn-cf-east.streamable.com/video/mp4/moo9j0.mp4?Expires=1&Signature=X' });
  });
  it('falls back to mp4-mobile when there is no full mp4', async () => {
    const payload = { files: { 'mp4-mobile': { url: 'https://cdn-cf-west.streamable.com/video/mp4-mobile/x.mp4' } } };
    expect(await resolveOriginal({ platform: 'streamable', id: 'abc12' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://cdn-cf-west.streamable.com/video/mp4-mobile/x.mp4' });
  });
  it('rejects an mp4 URL that is not https .streamable.com (untrusted JSON)', async () => {
    const evil = { files: { mp4: { url: 'https://evil.example/x.mp4' } } };
    expect(await resolveOriginal({ platform: 'streamable', id: 'abc12' }, { fetch: mockFetch(evil) })).toBeNull();
  });
  it('returns null when there is no mp4 file (private/login-gated)', async () => {
    expect(await resolveOriginal({ platform: 'streamable', id: 'abc12' }, { fetch: mockFetch({ files: {} }) })).toBeNull();
  });
  it('returns null on a non-ok response, a bad id, or a throw', async () => {
    expect(await resolveOriginal({ platform: 'streamable', id: 'abc12' }, { fetch: mockFetch({}, false) })).toBeNull();
    expect(await resolveOriginal({ platform: 'streamable', id: 'bad id!' }, { fetch: mockFetch({ files: { mp4: { url: 'https://cdn-cf-east.streamable.com/x.mp4' } } }) })).toBeNull();
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'streamable', id: 'abc12' }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — redgifs', () => {
  const twoHop = (auth: unknown, gif: unknown, gifOk = true, authOk = true) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v2/auth/temporary')) return { ok: authOk, json: async () => auth };
      if (url.includes('/v2/gifs/')) {
        const authz = (init?.headers as Record<string, string> | undefined)?.Authorization;
        return { ok: gifOk && authz === 'Bearer TESTTOKEN', json: async () => gif };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;

  it('returns gif.urls.hd, pinned to .redgifs.com, after the token hop', async () => {
    const gif = { gif: { urls: { hd: 'https://media.redgifs.com/BrightExample.mp4', sd: 'https://media.redgifs.com/BrightExample-mobile.mp4' } } };
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: twoHop({ token: 'TESTTOKEN' }, gif) }))
      .toEqual({ url: 'https://media.redgifs.com/BrightExample.mp4' });
  });
  it('falls back to urls.sd when there is no hd', async () => {
    const gif = { gif: { urls: { sd: 'https://media.redgifs.com/x-mobile.mp4' } } };
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: twoHop({ token: 'TESTTOKEN' }, gif) }))
      .toEqual({ url: 'https://media.redgifs.com/x-mobile.mp4' });
  });
  it('accepts a top-level urls shape (no gif wrapper)', async () => {
    const gif = { urls: { hd: 'https://media.redgifs.com/y.mp4' } };
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: twoHop({ token: 'TESTTOKEN' }, gif) }))
      .toEqual({ url: 'https://media.redgifs.com/y.mp4' });
  });
  it('rejects a media URL that is not https .redgifs.com (untrusted JSON)', async () => {
    const gif = { gif: { urls: { hd: 'https://evil.example/x.mp4' } } };
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: twoHop({ token: 'TESTTOKEN' }, gif) })).toBeNull();
  });
  it('returns null when the auth hop fails or yields no token', async () => {
    const gif = { gif: { urls: { hd: 'https://media.redgifs.com/x.mp4' } } };
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: twoHop({ token: 'TESTTOKEN' }, gif, true, false) })).toBeNull();
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: twoHop({}, gif) })).toBeNull();
  });
  it('returns null on a bad id, a failed gif hop, or a throw', async () => {
    const gif = { gif: { urls: { hd: 'https://media.redgifs.com/x.mp4' } } };
    expect(await resolveOriginal({ platform: 'redgifs', id: 'BAD ID!' }, { fetch: twoHop({ token: 'TESTTOKEN' }, gif) })).toBeNull();
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: twoHop({ token: 'TESTTOKEN' }, gif, false) })).toBeNull();
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'redgifs', id: 'brightexample' }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — twitch', () => {
  const SLUG = 'AwkwardHelplessSalamanderSwiftRage';
  const token = twitchClip.data.clip.playbackAccessToken;

  it('signs the highest-quality clip mp4 with sig+token (fixture), pinned to twitchcdn.net', async () => {
    const res = await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch(twitchClip) });
    expect(res).not.toBeNull();
    const u = new URL(res!.url);
    expect(u.hostname).toBe('production.assets.clips.twitchcdn.net');
    expect(u.pathname).toBe(`/v2/media/${SLUG}/1080.mp4`);
    expect(u.searchParams.get('sig')).toBe(token.signature);
    expect(u.searchParams.get('token')).toBe(token.value);
  });

  it('tolerates a GQL array-envelope response', async () => {
    const res = await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch([twitchClip]) });
    expect(new URL(res!.url).pathname).toBe(`/v2/media/${SLUG}/1080.mp4`);
  });

  it('accepts an older clips-media-assets2.twitch.tv source host', async () => {
    const payload = { data: { clip: { playbackAccessToken: { signature: 'sig', value: 'tok' }, videoQualities: [
      { quality: '480', sourceURL: 'https://clips-media-assets2.twitch.tv/vod-abc/480.mp4' },
    ] } } };
    const res = await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch(payload) });
    expect(new URL(res!.url).hostname).toBe('clips-media-assets2.twitch.tv');
  });

  it('rejects a source URL that is not a Twitch clip CDN (untrusted JSON)', async () => {
    const evil = { data: { clip: { playbackAccessToken: { signature: 'sig', value: 'tok' }, videoQualities: [
      { quality: '1080', sourceURL: 'https://evil.example/x.mp4' },
    ] } } };
    expect(await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch(evil) })).toBeNull();
  });

  it('returns null (fail-closed) when the playback access token is missing', async () => {
    const noToken = { data: { clip: { videoQualities: [
      { quality: '1080', sourceURL: 'https://production.assets.clips.twitchcdn.net/x/1080.mp4' },
    ] } } };
    expect(await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch(noToken) })).toBeNull();
  });

  it('returns null when there are no video qualities (private/expired/rotated op)', async () => {
    const empty = { data: { clip: { playbackAccessToken: { signature: 'sig', value: 'tok' }, videoQualities: [] } } };
    expect(await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch(empty) })).toBeNull();
    expect(await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch({ data: { clip: null } }) })).toBeNull();
  });

  it('returns null on a non-ok response, a bad slug, or a throw', async () => {
    expect(await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: mockFetch(twitchClip, false) })).toBeNull();
    expect(await resolveOriginal({ platform: 'twitch', id: 'bad slug!' }, { fetch: mockFetch(twitchClip) })).toBeNull();
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'twitch', id: SLUG }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — 9gag', () => {
  const noFetch = (async () => { throw new Error('should not fetch'); }) as unknown as typeof fetch;

  it('builds the universal _460sv.mp4 from the post id without fetching', async () => {
    expect(await resolveOriginal({ platform: '9gag', id: 'aOMMxxA' }, { fetch: noFetch }))
      .toEqual({ url: 'https://img-9gag-fun.9cache.com/photo/aOMMxxA_460sv.mp4' });
  });

  it('returns null for a bad id (never reaches the URL)', async () => {
    expect(await resolveOriginal({ platform: '9gag', id: 'bad id!' }, { fetch: noFetch })).toBeNull();
    expect(await resolveOriginal({ platform: '9gag', id: '' }, { fetch: noFetch })).toBeNull();
  });
});

describe('resolveOriginal — twitch VOD', () => {
  const VID = '1234567890';
  const okToken = { data: { videoPlaybackAccessToken: { value: 'TOKEN_VALUE', signature: 'SIG' } } };

  it('mints the usher HLS master with sig+token, pinned to ttvnw.net', async () => {
    const res = await resolveOriginal({ platform: 'twitch', id: `vod ${VID}` }, { fetch: mockFetch(okToken) });
    expect(res).not.toBeNull();
    expect(res!.hls).toBe(true);
    const u = new URL(res!.url);
    expect(u.hostname).toBe('usher.ttvnw.net');
    expect(u.pathname).toBe(`/vod/${VID}.m3u8`);
    expect(u.searchParams.get('sig')).toBe('SIG');
    expect(u.searchParams.get('token')).toBe('TOKEN_VALUE');
    expect(u.searchParams.get('allow_source')).toBe('true');
  });

  it('tolerates a GQL array-envelope response', async () => {
    const res = await resolveOriginal({ platform: 'twitch', id: `vod ${VID}` }, { fetch: mockFetch([okToken]) });
    expect(new URL(res!.url).pathname).toBe(`/vod/${VID}.m3u8`);
  });

  it('returns null (fail-closed) when the access token is missing or incomplete', async () => {
    expect(await resolveOriginal({ platform: 'twitch', id: `vod ${VID}` }, { fetch: mockFetch({ data: { videoPlaybackAccessToken: null } }) })).toBeNull();
    expect(await resolveOriginal({ platform: 'twitch', id: `vod ${VID}` }, { fetch: mockFetch({ data: { videoPlaybackAccessToken: { value: 'v' } } }) })).toBeNull();
  });

  it('returns null on a non-ok response or a throw', async () => {
    expect(await resolveOriginal({ platform: 'twitch', id: `vod ${VID}` }, { fetch: mockFetch(okToken, false) })).toBeNull();
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'twitch', id: `vod ${VID}` }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — soundcloud', () => {
  const TRACK = 'https://soundcloud.com/artist/my-track';
  const CLIENT = 'abcDEF1234567890';
  const pageHtml =
    '<script crossorigin src="https://a-v2.sndcdn.com/assets/0-abc.js"></script>' +
    '<script crossorigin src="https://a-v2.sndcdn.com/assets/50-app.js"></script>';
  const bundleJs = `window.__sc={};client_id:"${CLIENT}",env:"production"`;
  const hlsApi = 'https://api-v2.soundcloud.com/media/soundcloud:tracks:1/abc/stream/hls';
  const progApi = 'https://api-v2.soundcloud.com/media/soundcloud:tracks:1/abc/stream/progressive';
  const trackJson = () => ({ kind: 'track', media: { transcodings: [
    { url: progApi, format: { protocol: 'progressive', mime_type: 'audio/mpeg' } },
    { url: hlsApi, format: { protocol: 'hls', mime_type: 'audio/mpeg' } },
  ] } });

  const route = (opts: { track?: unknown; hlsUrl?: string; progUrl?: string; noClient?: boolean } = {}) =>
    (async (input: unknown) => {
      const url = String(input);
      if (url.includes('a-v2.sndcdn.com')) return { ok: true, text: async () => (opts.noClient ? 'no id' : bundleJs) };
      if (url.includes('/resolve')) return { ok: true, json: async () => (opts.track ?? trackJson()) };
      if (url.startsWith(hlsApi)) return { ok: true, json: async () => ({ url: opts.hlsUrl ?? 'https://cf-hls-media.sndcdn.com/media/1/hls.m3u8' }) };
      if (url.startsWith(progApi)) return { ok: true, json: async () => ({ url: opts.progUrl ?? 'https://cf-media.sndcdn.com/media/1/128.mp3' }) };
      if (url === TRACK) return { ok: true, text: async () => pageHtml };
      return { ok: false, json: async () => ({}), text: async () => '' };
    }) as unknown as typeof fetch;

  it('resolves the HLS transcoding to a sndcdn.com master (hls), scraping the client_id', async () => {
    const res = await resolveOriginal({ platform: 'soundcloud', id: TRACK }, { fetch: route() });
    expect(res).toEqual({ url: 'https://cf-hls-media.sndcdn.com/media/1/hls.m3u8', hls: true });
  });

  it('falls back to a progressive transcoding (direct file, no hls) when no HLS rendition exists', async () => {
    const t = { kind: 'track', media: { transcodings: [{ url: progApi, format: { protocol: 'progressive' } }] } };
    expect(await resolveOriginal({ platform: 'soundcloud', id: TRACK }, { fetch: route({ track: t }) }))
      .toEqual({ url: 'https://cf-media.sndcdn.com/media/1/128.mp3' });
  });

  it('returns null when the URL resolves to a non-track (user/playlist)', async () => {
    expect(await resolveOriginal({ platform: 'soundcloud', id: TRACK }, { fetch: route({ track: { kind: 'user' } }) })).toBeNull();
  });

  it('returns null when no client_id can be scraped', async () => {
    expect(await resolveOriginal({ platform: 'soundcloud', id: TRACK }, { fetch: route({ noClient: true }) })).toBeNull();
  });

  it('rejects a final stream URL that is not on sndcdn.com (untrusted JSON)', async () => {
    expect(await resolveOriginal({ platform: 'soundcloud', id: TRACK }, { fetch: route({ hlsUrl: 'https://evil.example/x.m3u8' }) })).toBeNull();
  });

  it('rejects a track-page URL that is not soundcloud.com (pin), never fetching', async () => {
    let calls = 0;
    const spyFetch = (async () => { calls++; return { ok: true, text: async () => '' }; }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'soundcloud', id: 'https://evil.example/a/b' }, { fetch: spyFetch })).toBeNull();
    expect(calls).toBe(0);
  });

  it('returns null on a non-ok page fetch or a throw', async () => {
    const notOk = (async () => ({ ok: false, text: async () => '', json: async () => ({}) })) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'soundcloud', id: TRACK }, { fetch: notOk })).toBeNull();
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'soundcloud', id: TRACK }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — kick clip', () => {
  const CLIP = 'clip_01HXYZ';
  const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;

  it('returns the clip_url mp4, pinned to kick.com', async () => {
    const payload = { clip: { clip_url: 'https://clips.kick.com/clips/abc/clip.mp4', video_url: null } };
    const res = await resolveOriginal({ platform: 'kick', id: CLIP }, { fetch: mockFetch(payload) });
    expect(res).toEqual({ url: 'https://clips.kick.com/clips/abc/clip.mp4' });
  });

  it('falls back to video_url when clip_url is absent', async () => {
    const payload = { clip: { video_url: 'https://clips.kick.com/x/v.mp4' } };
    const res = await resolveOriginal({ platform: 'kick', id: CLIP }, { fetch: mockFetch(payload) });
    expect(res!.url).toBe('https://clips.kick.com/x/v.mp4');
  });

  it('drops an off-CDN clip url (untrusted JSON)', async () => {
    const payload = { clip: { clip_url: 'https://evil.com/x.mp4' } };
    expect(await resolveOriginal({ platform: 'kick', id: CLIP }, { fetch: mockFetch(payload) })).toBeNull();
  });

  it('fails closed on a bad id, non-ok response, missing clip, or network error', async () => {
    expect(await resolveOriginal({ platform: 'kick', id: 'clip_bad!' }, { fetch: mockFetch({ clip: { clip_url: 'https://clips.kick.com/x.mp4' } }) })).toBeNull();
    expect(await resolveOriginal({ platform: 'kick', id: CLIP }, { fetch: mockFetch({ clip: { clip_url: 'https://clips.kick.com/x.mp4' } }, false) })).toBeNull();
    expect(await resolveOriginal({ platform: 'kick', id: CLIP }, { fetch: mockFetch({}) })).toBeNull();
    expect(await resolveOriginal({ platform: 'kick', id: CLIP }, { fetch: throwing })).toBeNull();
  });
});

describe('resolveOriginal — kick VOD', () => {
  const VID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;

  it('returns the source HLS master (hls:true), pinned to kick.com', async () => {
    const payload = { source: `https://stream.kick.com/ivs/v1/196233775518/${VID}/master.m3u8` };
    const res = await resolveOriginal({ platform: 'kick', id: `video ${VID}` }, { fetch: mockFetch(payload) });
    expect(res).toEqual({ url: payload.source, hls: true });
  });

  it('drops an off-CDN source', async () => {
    expect(await resolveOriginal({ platform: 'kick', id: `video ${VID}` }, { fetch: mockFetch({ source: 'https://evil.com/master.m3u8' }) })).toBeNull();
  });

  it('fails closed on a bad uuid, non-ok, missing source, or network error', async () => {
    expect(await resolveOriginal({ platform: 'kick', id: 'video 12345' }, { fetch: mockFetch({ source: 'https://stream.kick.com/x.m3u8' }) })).toBeNull();
    expect(await resolveOriginal({ platform: 'kick', id: `video ${VID}` }, { fetch: mockFetch({ source: 'https://stream.kick.com/x.m3u8' }, false) })).toBeNull();
    expect(await resolveOriginal({ platform: 'kick', id: `video ${VID}` }, { fetch: mockFetch({}) })).toBeNull();
    expect(await resolveOriginal({ platform: 'kick', id: `video ${VID}` }, { fetch: throwing })).toBeNull();
  });
});
