import { resolveOriginal } from '@/extension/shared/resolvers/network';

const mockFetch = (payload: unknown, ok = true) =>
  (async () => ({ ok, json: async () => payload })) as unknown as typeof fetch;

describe('resolveOriginal — twitter', () => {
  const tweetJson = {
    mediaDetails: [{
      video_info: { variants: [
        { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
        { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/lo.mp4' },
        { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/hi.mp4' },
      ] },
    }],
  };
  it('picks the highest-bitrate mp4', async () => {
    const url = await resolveOriginal({ platform: 'twitter', id: '123' }, { fetch: mockFetch(tweetJson) });
    expect(url).toEqual({ url: 'https://video.twimg.com/hi.mp4' });
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
});

describe('resolveOriginal — wallhaven', () => {
  it('returns data.path', async () => {
    const wh = { data: { path: 'https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png', file_type: 'image/png' } };
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'abcdef' }, { fetch: mockFetch(wh) }))
      .toEqual({ url: 'https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png' });
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

  it('returns the highest progressive mp4, pinned to vimeocdn.com', async () => {
    const payload = config([
      { height: 360, url: 'https://vod-progressive-ak.vimeocdn.com/a/360.mp4' },
      { height: 720, url: 'https://vod-progressive-ak.vimeocdn.com/a/720.mp4' },
      { height: 540, url: 'https://vod-progressive-ak.vimeocdn.com/a/540.mp4' },
    ]);
    expect(await resolveOriginal({ platform: 'vimeo', id: '76979871' }, { fetch: mockFetch(payload) }))
      .toEqual({ url: 'https://vod-progressive-ak.vimeocdn.com/a/720.mp4' });
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

  it('did:plc — resolves the PDS via plc.directory and builds the getBlob URL', async () => {
    const fetch = capturingFetch(pdsDoc);
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
