/** @vitest-environment jsdom */
import { retryingFetch } from '@mbd/core/net/retry';

function stubFetch(outcomes: Array<number | 'reject'>) {
  let i = 0;
  const calls: number[] = [];
  const fn = vi.fn(async () => {
    const o = outcomes[Math.min(i, outcomes.length - 1)];
    calls.push(i);
    i++;
    if (o === 'reject') throw new Error('network');
    return new Response('body', { status: o });
  });
  return { fn: fn as unknown as typeof fetch, calls: () => i };
}

function hungFetch() {
  let n = 0;
  const fn = vi.fn((_input: unknown, init?: RequestInit) => {
    n++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal!.reason ?? new DOMException('Aborted', 'AbortError'));
      });
    });
  });
  return { fn: fn as unknown as typeof fetch, calls: () => n };
}

const noWait = { sleep: async () => {}, random: () => 0.5 };

describe('retryingFetch', () => {
  it('retries a transient status up to maxAttempts then returns the final Response', async () => {
    const s = stubFetch([503, 503, 503]);
    const res = await retryingFetch(s.fn, { ...noWait, maxAttempts: 3 })('https://x/');
    expect(res.status).toBe(503);
    expect(s.calls()).toBe(3);
  });

  it('returns a success as soon as one arrives (no further attempts)', async () => {
    const s = stubFetch([500, 200, 200]);
    const res = await retryingFetch(s.fn, { ...noWait, maxAttempts: 3 })('https://x/');
    expect(res.status).toBe(200);
    expect(s.calls()).toBe(2);
  });

  it('does NOT retry a non-transient status', async () => {
    const s = stubFetch([404, 200]);
    const res = await retryingFetch(s.fn, { ...noWait, maxAttempts: 3 })('https://x/');
    expect(res.status).toBe(404);
    expect(s.calls()).toBe(1);
  });

  it('retries a network reject then re-throws after the last attempt', async () => {
    const s = stubFetch(['reject', 'reject']);
    await expect(retryingFetch(s.fn, { ...noWait, maxAttempts: 2 })('https://x/')).rejects.toThrow('network');
    expect(s.calls()).toBe(2);
  });

  it('honors Retry-After (seconds), clamped to maxDelayMs, and uses it as the sleep', async () => {
    const slept: number[] = [];
    const s = { fn: (vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '2' } })) as unknown) as typeof fetch };
    await retryingFetch(s.fn, { maxAttempts: 2, maxDelayMs: 5000, random: () => 0.5, sleep: async (ms) => { slept.push(ms); } })('https://x/');
    expect(slept[0]).toBe(2000);
  });

  it('stops and rejects when the signal aborts during backoff', async () => {
    const ac = new AbortController();
    const s = stubFetch([503, 200]);
    const sleep = async () => { ac.abort(); throw ac.signal.reason ?? new DOMException('Aborted', 'AbortError'); };
    await expect(retryingFetch(s.fn, { maxAttempts: 3, sleep, random: () => 0.5, signal: ac.signal })('https://x/')).rejects.toBeTruthy();
    expect(s.calls()).toBe(1);
  });

  it('returns the Response body unread so the caller can read it', async () => {
    const s = stubFetch([200]);
    const res = await retryingFetch(s.fn, noWait)('https://x/');
    await expect(res.text()).resolves.toBe('body');
  });

  describe('per-attempt timeout', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('aborts a hung attempt after timeoutMs so the fetch rejects instead of hanging forever', async () => {
      vi.useFakeTimers();
      const h = hungFetch();
      const p = retryingFetch(h.fn, { maxAttempts: 1, timeoutMs: 30_000 })('https://x/');
      let settled = false;
      p.catch(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      await expect(p).rejects.toBeTruthy();
      expect(h.calls()).toBe(1);
    });

    it('bounds a hung fetch across retries too — rejects after the last attempt\'s timeout, not forever', async () => {
      vi.useFakeTimers();
      const h = hungFetch();
      const p = retryingFetch(h.fn, { maxAttempts: 2, timeoutMs: 1000, sleep: async () => {} })('https://x/');
      const caught = p.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const err = await caught;
      expect(err).toBeTruthy();
      expect(h.calls()).toBe(2);
    });

    it('clears the per-attempt timer when the fetch settles quickly (no false abort, no leaked timer)', async () => {
      vi.useFakeTimers();
      const s = stubFetch([200]);
      const res = await retryingFetch(s.fn, { ...noWait, timeoutMs: 30_000 })('https://x/');
      expect(res.status).toBe(200);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a normal fast fetch still succeeds when no timeoutMs is configured (default unaffected)', async () => {
      const s = stubFetch([200]);
      const res = await retryingFetch(s.fn, noWait)('https://x/');
      expect(res.status).toBe(200);
    });
  });
});
