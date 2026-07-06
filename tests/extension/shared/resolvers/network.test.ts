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

describe('resolveOriginal — instagram', () => {
  const CDN = 'https://scontent-del2-3.cdninstagram.com';
  const reelJson = (code: string, mp4: string) => ({
    items: [{
      code,
      media_type: 2,
      image_versions2: { candidates: [{ url: `${CDN}/${code}_poster_n.jpg`, width: 720, height: 1280 }] },
      video_versions: [{ url: mp4, width: 720, height: 1280, type: 101 }],
    }],
  });
  const page = (json: unknown) => `<!doctype html><body><script type="application/json">${JSON.stringify(json)}</script></body>`;
  const mockHtml = (html: string, ok = true) => (async () => ({ ok, text: async () => html })) as unknown as typeof fetch;

  it('reads the real mp4 out of the reel page HTML (using the session)', async () => {
    const url = await resolveOriginal({ platform: 'instagram', id: 'ABC' }, { fetch: mockHtml(page(reelJson('ABC', `${CDN}/ABC_720.mp4`))) });
    expect(url).toBe(`${CDN}/ABC_720.mp4`);
  });

  it('returns null when the page ships no video (Instagram gated it)', async () => {
    expect(await resolveOriginal({ platform: 'instagram', id: 'ABC' }, { fetch: mockHtml('<html><body>Log in</body></html>') })).toBeNull();
  });

  it('rejects an mp4 that is not on an Instagram CDN (untrusted JSON URL)', async () => {
    expect(await resolveOriginal({ platform: 'instagram', id: 'ABC' }, { fetch: mockHtml(page(reelJson('ABC', 'https://evil.example/x.mp4'))) })).toBeNull();
  });

  it('returns null for a malformed shortcode without fetching', async () => {
    let called = false;
    const spy = (async () => { called = true; return { ok: true, text: async () => '' }; }) as unknown as typeof fetch;
    expect(await resolveOriginal({ platform: 'instagram', id: 'bad id!' }, { fetch: spy })).toBeNull();
    expect(called).toBe(false);
  });

  it('returns null on a non-ok response', async () => {
    expect(await resolveOriginal({ platform: 'instagram', id: 'ABC' }, { fetch: mockHtml('', false) })).toBeNull();
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
