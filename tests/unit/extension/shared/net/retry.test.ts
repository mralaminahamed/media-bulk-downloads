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
});
