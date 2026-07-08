import { installReplayOnReady, installResponseSniffer, installUrlSniffer, makeSnifferEmit } from '@/extension/shared/resolvers/sniffers/response-sniffer';

// jsdom does not implement `Request`, so `input instanceof Request` (the sniffers'
// check for a Request-shaped fetch argument) would throw a bare ReferenceError —
// silently swallowed by the sniffers' own defensive try/catch, which would hide
// the real branch rather than exercise it. A minimal polyfill lets `instanceof`
// evaluate for real, the same way it does against the browser's own `Request`.
class FakeRequest {
  constructor(public url: string) {}
}
const origGlobalRequest = (globalThis as { Request?: unknown }).Request;
beforeAll(() => {
  (globalThis as { Request?: unknown }).Request = FakeRequest;
});
afterAll(() => {
  (globalThis as { Request?: unknown }).Request = origGlobalRequest;
});

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

  it('feeds an XHR JSON API response body to emit on load', () => {
    // Stub the native send so nothing hits the (nonexistent) network; install
    // captures this as the "native" send it forwards to.
    XMLHttpRequest.prototype.send = jest.fn();
    const seen: string[] = [];
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://site/api/thing');
    Object.defineProperty(xhr, 'responseText', { value: '{"MEDIA":1}', configurable: true });
    xhr.getResponseHeader = jest.fn().mockReturnValue('application/json');
    xhr.send();
    xhr.dispatchEvent(new Event('load'));
    expect(seen).toEqual(['{"MEDIA":1}']);
  });

  it('does not emit an XHR response from a non-API URL, or a non-JSON content type', () => {
    XMLHttpRequest.prototype.send = jest.fn();
    const seen: string[] = [];
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });

    const nonApi = new XMLHttpRequest();
    nonApi.open('GET', 'https://site/other');
    Object.defineProperty(nonApi, 'responseText', { value: 'x', configurable: true });
    nonApi.getResponseHeader = jest.fn().mockReturnValue('application/json');
    nonApi.send();
    nonApi.dispatchEvent(new Event('load'));

    const notJson = new XMLHttpRequest();
    notJson.open('GET', 'https://site/api/thing');
    Object.defineProperty(notJson, 'responseText', { value: 'x', configurable: true });
    notJson.getResponseHeader = jest.fn().mockReturnValue('text/html');
    notJson.send();
    notJson.dispatchEvent(new Event('load'));

    expect(seen).toEqual([]);
  });

  it('resolves the request URL from a Request instance argument (not just a string)', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue(jsonResponse('FROM-REQUEST')) as unknown as typeof fetch;
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });
    await window.fetch(new FakeRequest('https://site/api/thing') as unknown as Request);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['FROM-REQUEST']);
  });

  it('resolves the request URL via String() for an argument that is neither a string nor a Request (e.g. a URL object)', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue(jsonResponse('FROM-URL-OBJECT')) as unknown as typeof fetch;
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });
    await window.fetch(new URL('https://site/api/thing') as unknown as RequestInfo);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['FROM-URL-OBJECT']);
  });

  it('does not throw and reports nothing when fetch is called with no URL argument at all', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue(jsonResponse('X')) as unknown as typeof fetch;
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });
    await expect(window.fetch(undefined as unknown as RequestInfo)).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
  });

  it('does not emit when the API response has no content-type header at all (missing field)', async () => {
    const seen: string[] = [];
    const headerless = { headers: { get: () => null }, clone: () => ({ text: () => Promise.resolve('BODY') }) } as unknown as Response;
    window.fetch = jest.fn().mockResolvedValue(headerless) as unknown as typeof fetch;
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });
    await window.fetch('https://site/api/thing');
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
  });

  it('swallows a failure reading the response body and never disturbs the original fetch', async () => {
    const seen: string[] = [];
    const brokenBody = {
      headers: { get: () => 'application/json' },
      clone: () => ({ text: () => Promise.reject(new Error('stream aborted')) }),
    } as unknown as Response;
    window.fetch = jest.fn().mockResolvedValue(brokenBody) as unknown as typeof fetch;
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });
    await expect(window.fetch('https://site/api/thing')).resolves.toBe(brokenBody);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
  });

  it('still propagates a fetch rejection to the caller (the page still sees its own network errors)', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    installResponseSniffer({ isApi: () => true, emit: (t) => seen.push(t), urlKey: '__k' });
    await expect(window.fetch('https://site/api/thing')).rejects.toThrow('network down');
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
  });

  it('does not emit on load if send() fires without a prior open() call (url never captured)', () => {
    XMLHttpRequest.prototype.send = jest.fn();
    const seen: string[] = [];
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });

    const xhr = new XMLHttpRequest(); // no .open() — the urlKey property was never set
    Object.defineProperty(xhr, 'responseText', { value: '{"MEDIA":1}', configurable: true });
    xhr.getResponseHeader = jest.fn().mockReturnValue('application/json');
    xhr.send();
    xhr.dispatchEvent(new Event('load'));
    expect(seen).toEqual([]);
  });

  it('does not emit on load when the XHR response has no content-type header', () => {
    XMLHttpRequest.prototype.send = jest.fn();
    const seen: string[] = [];
    installResponseSniffer({ isApi: (u) => u.includes('/api/'), emit: (t) => seen.push(t), urlKey: '__k' });

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://site/api/thing');
    Object.defineProperty(xhr, 'responseText', { value: '{"MEDIA":1}', configurable: true });
    xhr.getResponseHeader = jest.fn().mockReturnValue(null); // header missing
    xhr.send();
    xhr.dispatchEvent(new Event('load'));
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

  it('resolves the reported URL from a Request instance argument (not just a string)', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue('ok') as unknown as typeof fetch;
    installUrlSniffer({ isMatch: (u) => u.endsWith('.m3u8'), onUrl: (u) => seen.push(u) });
    await window.fetch(new FakeRequest('https://cdn/from-request.m3u8') as unknown as Request);
    expect(seen).toEqual(['https://cdn/from-request.m3u8']);
  });

  it('resolves the reported URL via String() for an argument that is neither a string nor a Request', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue('ok') as unknown as typeof fetch;
    installUrlSniffer({ isMatch: (u) => u.endsWith('.m3u8'), onUrl: (u) => seen.push(u) });
    await window.fetch(new URL('https://cdn/from-url-object.m3u8') as unknown as RequestInfo);
    expect(seen).toEqual(['https://cdn/from-url-object.m3u8']);
  });

  it('does not throw and reports nothing when fetch is called with no URL argument at all', async () => {
    const seen: string[] = [];
    window.fetch = jest.fn().mockResolvedValue('ok') as unknown as typeof fetch;
    installUrlSniffer({ isMatch: (u) => u.endsWith('.m3u8'), onUrl: (u) => seen.push(u) });
    await expect(window.fetch(undefined as unknown as RequestInfo)).resolves.toBe('ok');
    expect(seen).toEqual([]);
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
