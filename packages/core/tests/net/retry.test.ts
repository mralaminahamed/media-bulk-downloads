/** @vitest-environment jsdom */
import { retryingFetch } from '@mbd/core/net/retry';

// A fetch stub that yields the given outcomes in order. Each outcome is either a
// status number (→ a Response with that status) or the string 'reject' (→ throws).
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

// A fetch stub that never resolves on its own — mirrors a slow/unresponsive
// public host that accepts the TCP connection but never answers. It only
// settles (rejects) if the caller wires an AbortSignal into the request init
// and that signal aborts — exactly like the real `fetch`.
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

// Deterministic: no real timers, no real jitter.
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
    expect(slept[0]).toBe(2000); // 2s, under the 5s cap, not jittered
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

  // Bug: a slow/unresponsive PUBLIC host that never answers hangs the fetch
  // forever — retryingFetch retries on rejection/retryable-status but never
  // times out a hung attempt. Each attempt must get a bounded timeout.
  describe('per-attempt timeout', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('aborts a hung attempt after timeoutMs so the fetch rejects instead of hanging forever', async () => {
      vi.useFakeTimers();
      const h = hungFetch();
      const p = retryingFetch(h.fn, { maxAttempts: 1, timeoutMs: 30_000 })('https://x/');
      let settled = false;
      p.catch(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(settled).toBe(false); // not aborted early

      await vi.advanceTimersByTimeAsync(2); // crosses the 30_000ms boundary
      await expect(p).rejects.toBeTruthy();
      expect(h.calls()).toBe(1); // bounded — one attempt, not an infinite hang
    });

    it('bounds a hung fetch across retries too — rejects after the last attempt\'s timeout, not forever', async () => {
      // Fake timers must be active BEFORE the per-attempt timer is scheduled —
      // otherwise that first setTimeout is a real one, disconnected from the
      // fake clock we advance below.
      vi.useFakeTimers();
      const h = hungFetch();
      const p = retryingFetch(h.fn, { maxAttempts: 2, timeoutMs: 1000, sleep: async () => {} })('https://x/');
      const caught = p.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1000); // attempt 1 times out
      await vi.advanceTimersByTimeAsync(1000); // attempt 2 times out → exhausted

      const err = await caught;
      expect(err).toBeTruthy();
      expect(h.calls()).toBe(2);
    });

    it('clears the per-attempt timer when the fetch settles quickly (no false abort, no leaked timer)', async () => {
      vi.useFakeTimers();
      const s = stubFetch([200]);
      const res = await retryingFetch(s.fn, { ...noWait, timeoutMs: 30_000 })('https://x/');
      expect(res.status).toBe(200);
      expect(vi.getTimerCount()).toBe(0); // the 30s timer was cleared on settle
    });

    it('a normal fast fetch still succeeds when no timeoutMs is configured (default unaffected)', async () => {
      const s = stubFetch([200]);
      const res = await retryingFetch(s.fn, noWait)('https://x/');
      expect(res.status).toBe(200);
    });
  });
});
