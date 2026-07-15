/** @vitest-environment jsdom */
import { resolveOriginalsBatch } from '@/extension/background/sniffer-store';

describe('resolveOriginalsBatch default deps', () => {
  it('retries a transient 503 on the default resolver fetch', async () => {
    let n = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      n++;
      // First call 503 (transient), then a minimal tweet-result JSON the
      // resolver accepts (empty mediaDetails is fine — this test only cares
      // that the default fetch retries the transient, not the resolved value).
      if (n === 1) return new Response('', { status: 503 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    try {
      // A Twitter photo hint routes through network.ts's twitter() -> deps.fetch
      // (the wrapped default), proving the default resolver fetch is retried.
      await resolveOriginalsBatch([
        { src: 'https://pbs.twimg.com/media/A.jpg', hint: { platform: 'twitter', id: 'photo 1 1' } },
      ]);
      expect(n).toBeGreaterThanOrEqual(2); // the 503 was retried
    } finally {
      spy.mockRestore();
    }
  });
});

describe('resolveOriginalsBatch authed gate', () => {
  const h = (src: string, platform: any, id: string) => ({ src, hint: { platform, id } });
  const ORIG = 'https://v.sankakucomplex.com/data/26/20/2620d86cb72802a5dcd9e1e189b75e64.jpg?e=1';
  const okDetail = (async () => ({ ok: true, json: async () => ({ data: { file_url: ORIG } }) })) as unknown as typeof fetch;
  const fail = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;

  it('skips a Sankaku hint when authed is false (never fires an authed call)', async () => {
    const spy = vi.fn(okDetail);
    const out = await resolveOriginalsBatch([h('p1', 'sankaku', 'vkr3E7Yo8MZ')], { fetch: spy as unknown as typeof fetch }, undefined, false);
    expect(out).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolves a Sankaku hint when authed is true', async () => {
    const out = await resolveOriginalsBatch([h('p1', 'sankaku', 'vkr3E7Yo8MZ')], { fetch: okDetail }, undefined, true);
    expect(out).toEqual({ p1: { url: ORIG } });
  });

  it('aborts an authed batch after repeated failure with no successes', async () => {
    const spy = vi.fn(fail);
    // Distinct ids → distinct detail URLs, so memoizeFetch does NOT collapse them
    // and each is a real attempt; the early-abort must stop before all 8 fire.
    const hints = Array.from({ length: 8 }, (_, n) => h(`p${n}`, 'sankaku', `id${n}aaaaaaaa`));
    const out = await resolveOriginalsBatch(hints, { fetch: spy as unknown as typeof fetch }, undefined, true);
    expect(out).toEqual({});
    expect(spy.mock.calls.length).toBeLessThan(8); // stopped early, did not hammer all 8
  });
});
