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
