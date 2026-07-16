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

// HTML fixtures imported as raw strings (vite `?raw`) so the read is location-
// and cwd-independent — works under the package's own Vitest project.
import flickrSizesHtml from '../fixtures/flickr/sizes-6k.html?raw';
import asEmbed from '../fixtures/artstation/embed.html?raw';

const mockFetch = (payload: unknown, ok = true) =>
  (async () => ({ ok, json: async () => payload })) as unknown as typeof fetch;

describe('resolveOriginal — twitter', () => {
  it('picks the highest-bitrate mp4 from a real syndication response (fixture)', async () => {
    // The captured tweet has 1 HLS + 3 mp4 variants (256k/832k/2176k); the 2176k wins.
    const url = await resolveOriginal({ platform: 'twitter', id: '123' }, { fetch: mockFetch(tweetResultVideo) });
    expect(url).toEqual({ url: 'https://video.twimg.com/amplify_video/2074974762711785472/vid/avc1/720x708/ENlI2GicSM30_PC_.mp4' });
  });
  it('falls back to the x-mpegURL master from a real live/broadcast syndication response (fixture)', async () => {
    // The captured live tweet carries only an HLS master (no progressive mp4), so the
    // resolver returns it as a capturable stream — the real-envelope counterpart to the
    // crafted HLS-only cases below.
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
    // A string that isn't a parseable URL makes pinnedUrl's `new URL()` throw; its
    // catch returns null, so the whole resolve yields null rather than crashing.
    const bad = { mediaDetails: [{ video_info: { variants: [
      { content_type: 'video/mp4', bitrate: 1, url: 'not a url' },
    ] } }] };
    return expect(resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(bad) })).resolves.toBeNull();
  });
  it('returns null for an ok response with no mediaDetails at all', async () => {
    // Missing `mediaDetails` (e.g. a text-only tweet) coerces to [] — no variants,
    // no mp4, no HLS, so null.
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch({}) })).toBeNull();
  });
  it('tolerates a mediaDetails entry with no video_info/variants (still resolves the mp4 from a sibling)', async () => {
    // A photo detail (no video_info) sits next to a real video detail; the `?? []`
    // guards keep the loop from throwing and the video still resolves.
    const mixed = { mediaDetails: [
      {},
      { video_info: { variants: [{ content_type: 'video/mp4', bitrate: 5, url: 'https://video.twimg.com/only.mp4' }] } },
    ] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(mixed) }))
      .toEqual({ url: 'https://video.twimg.com/only.mp4' });
  });
  it('keeps the first, higher-bitrate mp4 when a later variant is lower-bitrate (descending order)', async () => {
    // Exercises the `bitrate > best.bitrate` comparison being false for the 2nd mp4.
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
    // No mp4 anywhere, so the HLS fallback loop runs; the first (photo) detail has no
    // video_info (its `?? []` guard keeps the loop safe), and the live-video detail
    // supplies the x-mpegURL master.
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
    // existing tweet-result-video.json path unchanged
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
    // The captured config has 360/270/720/540 progressive renditions; the 720p wins.
    expect(await resolveOriginal({ platform: 'vimeo', id: '76979871' }, { fetch: mockFetch(vimeoConfig) }))
      .toEqual({ url: 'https://vod-progressive-ak.vimeocdn.com/exp=SIG~acl=SIG~hmac=SIG/vimeo-prod/720p.mp4' });
  });

  it('falls back to the default_cdn HLS master from a real HLS/DASH-only config (fixture)', async () => {
    // This captured config has an empty `progressive` array, so the resolver takes the
    // `hls` block and selects the default_cdn (akfire_interconnect_quic) — exercising the
    // real cdns shape that player-config.json's own hls block never reaches (progressive wins there).
    expect(await resolveOriginal({ platform: 'vimeo', id: '76979871' }, { fetch: mockFetch(vimeoHlsConfig) }))
      .toEqual({ url: 'https://vod-adaptive-ak.vimeocdn.com/exp=SIG~acl=SIG~hmac=SIG/vimeo-prod-hls/master.m3u8', hls: true });
  });

  it('returns null when there is no progressive rendition (HLS/DASH-only)', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(config([])) })).toBeNull();
  });

  it('returns null when the config has no progressive key at all (and no HLS)', async () => {
    // `files.progressive` absent → the `?? []` guard yields an empty loop, not a throw.
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

describe('resolveOriginal — bsky (getBlob)', () => {
  const pdsDoc = {
    service: [
      { id: '#atproto_label', type: 'AtprotoLabeler', serviceEndpoint: 'https://labeler.example' },
      { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://puffball.us-east.host.bsky.network' },
    ],
  };
  // A fetch that records the URL it was called with and returns `payload`.
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
    // Real-shaped atproto DID doc (multiple @context entries, verificationMethod, the
    // #atproto_pds service): pdsFromDoc must still pick the PDS endpoint out of it.
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

  // SSRF guard: a did:web domain steers the .well-known/did.json fetch, so an
  // internal/loopback/link-local host must be rejected before any request.
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
    expect(called).toBe(false); // deterministic — no network for video
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
    // A hint whose platform isn't one of the four handled cases falls through to `default`.
    const unknownHint = { platform: 'facebook', id: 'x' } as unknown as Parameters<typeof resolveOriginal>[0];
    expect(await resolveOriginal(unknownHint, { fetch: spy })).toBeNull();
    expect(called).toBe(false);
  });
});

describe('resolveOriginal — id injection is neutralized', () => {
  // A resolver id ultimately comes from the page. Even though extraction regexes
  // constrain it, network.ts percent-encodes every id before splicing it into an
  // API URL — so a hostile id can't add path segments, extra query params, or a
  // different host. These assert that defense directly.
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
  // Two-hop mock: photo.gne resolves to `canonical`, the /sizes/ fetch resolves to
  // `sizesUrl` with `body`. Records the URLs it was asked to fetch.
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
  // A fetch that fails the test if it is ever called: reddit resolution is derived
  // from the id alone, with no network round-trip.
  const noFetch = (async () => { throw new Error('reddit must not fetch'); }) as unknown as typeof fetch;

  it('builds the signature-free v.redd.it HLS master from the id, without fetching', async () => {
    const out = await resolveOriginal({ platform: 'reddit', id: '8tnc0d8mu3ch1' }, { fetch: noFetch });
    expect(out).toEqual({ url: 'https://v.redd.it/8tnc0d8mu3ch1/HLSPlaylist.m3u8', hls: true });
  });

  it('derives the v.redd.it id from a real media.reddit_video shape (fixture) and yields its audio-muxable master', async () => {
    // The captured reddit_video fallback_url is the video-only CMAF mp4; the resolver
    // takes the v.redd.it id from its path and returns the audio-bearing HLS master.
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
  // A fetch that records the URL it was called with and returns `payload`.
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
    // pin-hls-widget.json has only HLS renditions (no V_720P), so the resolver returns
    // the V_HLSV4 master — the real-envelope counterpart to the crafted fallback below.
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
  // Dispatches by URL: /projects/ → the project JSON, embed.html → the clip HTML,
  // anything else → the /4k/ image probe. Records the URLs fetched.
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
    // Internal page URL → guarded before any fetch.
    expect(await resolve('<meta property="og:image" content="https://cdn.example/x.jpg">', true, 'http://localhost/post/1')).toBeNull();
    // Public page, but og:image points at an internal host.
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
  // Two-hop: /v2/auth/temporary → token, then /v2/gifs/<id> (Authorization) → urls.hd.
  // A URL-aware mock returns the auth or gif payload per request; the second hop
  // asserts the bearer header carries the token from the first.
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
    // 1080 wins over 720/360 by numeric quality label.
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
