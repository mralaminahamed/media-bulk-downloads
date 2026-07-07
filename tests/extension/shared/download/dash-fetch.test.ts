import { browserDashDeps } from '@/extension/shared/download/dash-fetch';

describe('browserDashDeps', () => {
  afterEach(() => { (global as { fetch?: unknown }).fetch = undefined; });

  it('fetchText returns the manifest body', async () => {
    (global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<MPD/>' });
    const deps = browserDashDeps();
    await expect(deps.fetchText('https://x/m.mpd')).resolves.toBe('<MPD/>');
  });

  it('fetchBytes returns the segment bytes', async () => {
    (global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    const deps = browserDashDeps();
    await expect(deps.fetchBytes('https://x/s.m4s')).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it('throws on a failed fetch', async () => {
    (global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const deps = browserDashDeps();
    await expect(deps.fetchText('https://x/m.mpd')).rejects.toThrow(/404/);
  });

  it('fetchBytes throws with the status on a non-ok segment response', async () => {
    (global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const deps = browserDashDeps();
    await expect(deps.fetchBytes('https://x/s.m4s')).rejects.toThrow(/500/);
  });

  it('passes onProgress through', () => {
    const cb = jest.fn();
    expect(browserDashDeps(cb).onProgress).toBe(cb);
  });
});
