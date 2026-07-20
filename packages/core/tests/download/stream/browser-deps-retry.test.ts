/** @vitest-environment jsdom */
import { browserHlsDeps } from '@mbd/core/download/stream/hls-webcrypto';
import { browserDashDeps } from '@mbd/core/download/stream/dash-fetch';

function transientThenOk(bytes: Uint8Array) {
  let n = 0;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    n++;
    if (n === 1) return new Response('', { status: 503 });
    return new Response(bytes.buffer as ArrayBuffer, { status: 200 });
  });
  return { spy, calls: () => n };
}

afterEach(() => { vi.restoreAllMocks(); });

it('browserHlsDeps.fetchBytes retries a transient 503 then returns bytes', async () => {
  const t = transientThenOk(new Uint8Array([1, 2, 3]));
  const out = await browserHlsDeps().fetchBytes('https://x/seg.ts');
  expect(Array.from(out)).toEqual([1, 2, 3]);
  expect(t.calls()).toBeGreaterThanOrEqual(2);
});

it('browserDashDeps.fetchBytes retries a transient 503 then returns bytes', async () => {
  const t = transientThenOk(new Uint8Array([4, 5]));
  const out = await browserDashDeps().fetchBytes('https://x/seg.m4s');
  expect(Array.from(out)).toEqual([4, 5]);
  expect(t.calls()).toBeGreaterThanOrEqual(2);
});

it('browserDashDeps.fetchBytes still throws on a permanent 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
  await expect(browserDashDeps().fetchBytes('https://x/seg.m4s')).rejects.toThrow(/404/);
});

it('browserHlsDeps fetches with redirect:"error"', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1]).buffer as ArrayBuffer, { status: 200 }));
  await browserHlsDeps().fetchBytes('https://x/seg.ts');
  expect(spy).toHaveBeenCalledWith('https://x/seg.ts', expect.objectContaining({ redirect: 'error' }));
});

it('browserDashDeps fetches with redirect:"error"', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<MPD/>', { status: 200 }));
  await browserDashDeps().fetchText('https://x/manifest.mpd');
  expect(spy).toHaveBeenCalledWith('https://x/manifest.mpd', expect.objectContaining({ redirect: 'error' }));
});
