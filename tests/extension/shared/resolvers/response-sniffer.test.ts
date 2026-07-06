import { installResponseSniffer, makeSnifferEmit } from '@/extension/shared/resolvers/response-sniffer';

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
