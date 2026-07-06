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
    expect(url).toBe('https://video.twimg.com/hi.mp4');
  });
  it('returns null when only HLS variants exist', async () => {
    const hls = { mediaDetails: [{ video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'x.m3u8' }] } }] };
    expect(await resolveOriginal({ platform: 'twitter', id: '1' }, { fetch: mockFetch(hls) })).toBeNull();
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
});

describe('resolveOriginal — wallhaven', () => {
  it('returns data.path', async () => {
    const wh = { data: { path: 'https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png', file_type: 'image/png' } };
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'abcdef' }, { fetch: mockFetch(wh) }))
      .toBe('https://w.wallhaven.cc/full/ab/wallhaven-abcdef.png');
  });
  it('returns null on 401 (nsfw/unlisted)', async () => {
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'x' }, { fetch: mockFetch({}, false) })).toBeNull();
  });
  it('rejects a data.path pointing off-host (untrusted JSON URL)', async () => {
    const evil = { data: { path: 'https://evil.example/x.png' } };
    expect(await resolveOriginal({ platform: 'wallhaven', id: 'x' }, { fetch: mockFetch(evil) })).toBeNull();
  });
});

describe('resolveOriginal — unsplash', () => {
  it('returns the /download URL without fetching', async () => {
    let called = false;
    const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    const url = await resolveOriginal({ platform: 'unsplash', id: 'abc123' }, { fetch: spy });
    expect(url).toBe('https://unsplash.com/photos/abc123/download');
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
      .toBe('https://vod-progressive-ak.vimeocdn.com/a/720.mp4');
  });

  it('returns null when there is no progressive rendition (HLS/DASH-only)', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(config([])) })).toBeNull();
  });

  it('rejects a progressive URL that is not https vimeocdn.com (untrusted JSON URL)', async () => {
    const evil = config([{ height: 1080, url: 'https://evil.example/x.mp4' }]);
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch(evil) })).toBeNull();
  });

  it('returns null on a 403 (domain-locked) config', async () => {
    expect(await resolveOriginal({ platform: 'vimeo', id: '1' }, { fetch: mockFetch({}, false) })).toBeNull();
  });
});
