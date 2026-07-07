import { installReplayOnReady, installResponseSniffer, installUrlSniffer, makeSnifferEmit } from '@/extension/shared/resolvers/sniffers/response-sniffer';

describe('makeSnifferEmit', () => {
  let posted: unknown[];
  beforeEach(() => {
    posted = [];
    (window.postMessage as unknown) = jest.fn((msg: unknown) => posted.push(msg));
  });

  const emit = makeSnifferEmit<number>({
    guard: (t) => t.includes('MEDIA'),
    extract: (json) => (json as { items?: number[] }).items ?? [],
    envelope: (items) => ({ source: 'test', items }),
  });

  it('posts an envelope when the guard passes and items are extracted', () => {
    emit(JSON.stringify({ MEDIA: 1, items: [1, 2] }));
    expect(posted).toEqual([{ source: 'test', items: [1, 2] }]);
  });

  it('skips (no parse/post) when the cheap substring guard fails', () => {
    emit(JSON.stringify({ items: [1] })); // no "MEDIA" substring
    expect(posted).toEqual([]);
  });

  it('skips when extraction yields nothing', () => {
    emit(JSON.stringify({ MEDIA: 1, items: [] }));
    expect(posted).toEqual([]);
  });

  it('ignores invalid JSON without throwing', () => {
    expect(() => emit('MEDIA but not json {')).not.toThrow();
    expect(posted).toEqual([]);
  });
});

describe('installResponseSniffer (fetch path)', () => {
  const origFetch = window.fetch;
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  afterEach(() => {
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origOpen;
    XMLHttpRequest.prototype.send = origSend;
  });

  const jsonResponse = (body: string) =>
    ({ headers: { get: () => 'application/json' }, clone: () => ({ text: () => Promise.resolve(body) }) }) as unknown as Response;

  it('feeds a JSON API response body to emit', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue(jsonResponse('BODY')) as unknown as typeof fetch;
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });
    await window.fetch('https://site/api/thing');
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['BODY']);
  });

  it('ignores responses from non-API URLs', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue(jsonResponse('BODY')) as unknown as typeof fetch;
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });
    await window.fetch('https://site/other');
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
  });
});

describe('installUrlSniffer', () => {
  const origFetch = window.fetch;
  const origOpen = XMLHttpRequest.prototype.open;
  afterEach(() => {
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origOpen;
  });

  it('reports a matching fetch URL and passes the call through', async () => {
    const seen: string[] = [];
    const native = jest.fn().mockResolvedValue('ok');
    window.fetch = native as unknown as typeof fetch;
    installUrlSniffer({ isMatch: (u) => u.endsWith('.m3u8'), onUrl: (u) => seen.push(u) });
    await window.fetch('https://cdn/master.m3u8');
    await window.fetch('https://cdn/thumb.jpg');
    expect(seen).toEqual(['https://cdn/master.m3u8']);
    expect(native).toHaveBeenCalledTimes(2); // both calls still reach native fetch
  });

  it('resolves a relative URL against the page before matching', () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue('ok') as unknown as typeof fetch;
    installUrlSniffer({ isMatch: (u) => u.endsWith('.m3u8'), onUrl: (u) => seen.push(u) });
    void window.fetch('live/index.m3u8');
    expect(seen).toEqual([`${location.origin}/live/index.m3u8`]);
  });

  it('reports a matching XMLHttpRequest.open URL', () => {
    const seen: string[] = [];
    window.fetch = jest.fn() as unknown as typeof fetch;
    installUrlSniffer({ isMatch: (u) => u.endsWith('.m3u8'), onUrl: (u) => seen.push(u) });
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://cdn/x/stream.m3u8');
    expect(seen).toEqual(['https://cdn/x/stream.m3u8']);
  });
});

describe('installReplayOnReady', () => {
  const fire = (data: unknown, opts: { origin?: string; source?: unknown } = {}) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: opts.origin ?? location.origin,
        source: ('source' in opts ? opts.source : window) as never,
      }),
    );

  it('runs the replay when the ready envelope arrives from the same window + origin', () => {
    const replay = jest.fn();
    installReplayOnReady('ibd-hls-ready', replay);
    fire({ source: 'ibd-hls-ready' });
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it('ignores a wrong origin, a foreign window source, and a non-ready envelope', () => {
    const replay = jest.fn();
    installReplayOnReady('ibd-hls-ready', replay);
    fire({ source: 'ibd-hls-ready' }, { origin: 'https://evil.example' });
    fire({ source: 'ibd-hls-ready' }, { source: null });
    fire({ source: 'something-else' });
    expect(replay).not.toHaveBeenCalled();
  });
});
