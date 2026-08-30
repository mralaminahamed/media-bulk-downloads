import { probeMediaMeta, probeMediaMetaBatch } from '@mbd/core/net/size-probe';

const res = (init: { status?: number; headers?: Record<string, string> }): Response =>
  new Response(null, { status: init.status ?? 200, headers: init.headers ?? {} });

describe('probeMediaMeta', () => {
  it('reads Content-Length and Content-Type from a HEAD', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      res({ headers: { 'content-length': '123456', 'content-type': 'image/heic' } }));
    await expect(probeMediaMeta('https://cdn.ex/a.bin', { fetch: fetchImpl })).resolves.toEqual({
      ok: true, bytes: 123456, type: 'heic',
    });
    expect(vi.mocked(fetchImpl).mock.calls[0][1]).toMatchObject({ method: 'HEAD' });
  });

  it('falls back to a 1-byte ranged GET when HEAD is rejected', async () => {
    const fetchImpl = vi.fn(async (_u: URL | RequestInfo, init?: RequestInit) =>
      init?.method === 'HEAD'
        ? res({ status: 405 })
        : res({ status: 206, headers: { 'content-range': 'bytes 0-0/987654', 'content-type': 'image/jpeg' } }));

    await expect(probeMediaMeta('https://cdn.ex/a.jpg', { fetch: fetchImpl })).resolves.toEqual({
      ok: true, bytes: 987654, type: 'jpeg',
    });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'GET', headers: { Range: 'bytes=0-0' } });
  });

  it('falls back when HEAD throws outright', async () => {
    const fetchImpl = vi.fn(async (_u: URL | RequestInfo, init?: RequestInit) => {
      if (init?.method === 'HEAD') throw new TypeError('Failed to fetch');
      return res({ status: 206, headers: { 'content-range': 'bytes 0-0/42' } });
    });
    await expect(probeMediaMeta('https://cdn.ex/a.jpg', { fetch: fetchImpl })).resolves.toMatchObject({ ok: true, bytes: 42 });
  });

  it('reports a dead link without a size', async () => {
    const fetchImpl = vi.fn(async () => res({ status: 403 }));
    await expect(probeMediaMeta('https://cdn.ex/gone.jpg', { fetch: fetchImpl })).resolves.toEqual({ ok: false });
  });

  it('omits bytes when the server sends no length at all', async () => {
    const fetchImpl = vi.fn(async () => res({ headers: { 'content-type': 'image/png' } }));
    await expect(probeMediaMeta('https://cdn.ex/chunked.png', { fetch: fetchImpl })).resolves.toEqual({ ok: true, type: 'png' });
  });

  it('ignores a nonsensical Content-Length', async () => {
    const fetchImpl = vi.fn(async () => res({ headers: { 'content-length': '-5' } }));
    await expect(probeMediaMeta('https://cdn.ex/x.jpg', { fetch: fetchImpl })).resolves.toEqual({ ok: true });
  });

  it('refuses a private/internal host without issuing a request (SSRF)', async () => {
    const fetchImpl = vi.fn(async () => res({}));
    await expect(probeMediaMeta('http://127.0.0.1/secret.jpg', { fetch: fetchImpl })).resolves.toEqual({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never probes a data: or blob: URL', async () => {
    const fetchImpl = vi.fn(async () => res({}));
    await expect(probeMediaMeta('data:image/png;base64,AAAA', { fetch: fetchImpl })).resolves.toEqual({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps an unknown content-type to no type rather than guessing', async () => {
    const fetchImpl = vi.fn(async () => res({ headers: { 'content-type': 'application/octet-stream' } }));
    await expect(probeMediaMeta('https://cdn.ex/x', { fetch: fetchImpl })).resolves.toEqual({ ok: true });
  });
});

describe('probeMediaMetaBatch', () => {
  it('probes every url and keys the results by url', async () => {
    const fetchImpl = vi.fn(async (u: URL | RequestInfo) =>
      res({ headers: { 'content-length': String(String(u).length * 100) } })) as unknown as typeof fetch;
    const out = await probeMediaMetaBatch(['https://cdn.ex/a', 'https://cdn.ex/bb'], { fetch: fetchImpl }, 2);
    expect(out['https://cdn.ex/a']).toMatchObject({ bytes: 1600 });
    expect(out['https://cdn.ex/bb']).toMatchObject({ bytes: 1700 });
  });

  it('never exceeds the concurrency cap', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return res({ headers: { 'content-length': '10' } });
    });
    await probeMediaMetaBatch(Array.from({ length: 12 }, (_, i) => `https://cdn.ex/${i}`), { fetch: fetchImpl }, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('one failure does not sink the batch', async () => {
    const fetchImpl = vi.fn(async (u: URL | RequestInfo) => {
      if (String(u).endsWith('bad')) throw new Error('boom');
      return res({ headers: { 'content-length': '7' } });
    }) as unknown as typeof fetch;
    const out = await probeMediaMetaBatch(['https://cdn.ex/bad', 'https://cdn.ex/good'], { fetch: fetchImpl }, 2);
    expect(out['https://cdn.ex/bad']).toEqual({ ok: false });
    expect(out['https://cdn.ex/good']).toMatchObject({ ok: true, bytes: 7 });
  });
});
