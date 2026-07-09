import { describe, it, expect } from 'vitest';
import {
  emptyQueue, enqueue, claimNext, activeCount, markActive, markDone,
  markFailed, scheduleRetry, cancel, retryFailed, clearFinished,
  backoffMs, MAX_ATTEMPTS,
} from '@/extension/shared/storage/download-queue';

const T0 = 1_000_000;

describe('download-queue reducer', () => {
  it('enqueue appends queued items and dedupes by url+filename against live items', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'https://x/a.jpg', filename: 'a.jpg' }], T0);
    s = enqueue(s, [{ url: 'https://x/a.jpg', filename: 'a.jpg' }], T0); // dup
    s = enqueue(s, [{ url: 'https://x/b.jpg', filename: 'b.jpg' }], T0);
    expect(s.items.map((i) => i.url)).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
    expect(s.items.every((i) => i.status === 'queued' && i.readyAt === T0)).toBe(true);
  });

  it('claimNext respects concurrency cap and marks item active', () => {
    let s = emptyQueue();
    s = enqueue(s, [
      { url: 'u1', filename: 'f1' }, { url: 'u2', filename: 'f2' }, { url: 'u3', filename: 'f3' },
    ], T0);
    const c1 = claimNext(s, 2, T0)!; s = c1.state;
    expect(c1.item.status).toBe('active');
    const c2 = claimNext(s, 2, T0)!; s = c2.state;
    expect(activeCount(s)).toBe(2);
    expect(claimNext(s, 2, T0)).toBeNull(); // cap reached
  });

  it('claimNext skips items whose readyAt is in the future', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }], T0);
    s.items[0].readyAt = T0 + 5000;
    expect(claimNext(s, 5, T0)).toBeNull();
    expect(claimNext(s, 5, T0 + 5000)).not.toBeNull();
  });

  it('claimNext returns nothing while paused', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }], T0);
    s.paused = true;
    expect(claimNext(s, 5, T0)).toBeNull();
  });

  it('backoffMs grows exponentially and caps at 30s', () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(99)).toBe(30000);
  });

  it('scheduleRetry requeues with backoff until MAX_ATTEMPTS, then fails', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }], T0);
    const c = claimNext(s, 5, T0)!; s = c.state;
    s = markActive(s, c.item.id, 42);
    s = scheduleRetry(s, c.item.id, T0);          // attempt 1
    expect(s.items[0].status).toBe('queued');
    expect(s.items[0].attempts).toBe(1);
    expect(s.items[0].readyAt).toBe(T0 + backoffMs(1));
    expect(s.items[0].downloadId).toBeUndefined();
    s.items[0].status = 'active'; s = scheduleRetry(s, c.item.id, T0); // attempt 2
    s.items[0].status = 'active'; s = scheduleRetry(s, c.item.id, T0); // attempt 3 → fail
    expect(s.items[0].attempts).toBe(MAX_ATTEMPTS);
    expect(s.items[0].status).toBe('failed');
  });

  it('markDone / markFailed set terminal status', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }], T0);
    const id = s.items[0].id;
    expect(markDone(s, id).items[0].status).toBe('done');
    expect(markFailed(s, id, 'boom').items[0]).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('unknown id is a no-op (never throws)', () => {
    const s = enqueue(emptyQueue(), [{ url: 'u1', filename: 'f1' }], T0);
    expect(() => markDone(s, 'nope')).not.toThrow();
    expect(markDone(s, 'nope').items[0].status).toBe('queued');
  });

  it('cancel removes non-finished item(s); "all" clears queued+active only', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }, { url: 'u2', filename: 'f2' }], T0);
    s = markDone(s, s.items[0].id);
    s = cancel(s, 'all');
    expect(s.items.map((i) => i.status)).toEqual(['done']);
  });

  it('retryFailed re-queues a failed item at now', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }], T0);
    s = markFailed(s, s.items[0].id, 'x');
    s = retryFailed(s, s.items[0].id, T0 + 10);
    expect(s.items[0]).toMatchObject({ status: 'queued', attempts: 0, readyAt: T0 + 10, error: undefined });
  });

  it('clearFinished drops done+failed', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }, { url: 'u2', filename: 'f2' }], T0);
    s = markDone(s, s.items[0].id);
    s = markFailed(s, s.items[1].id, 'x');
    expect(clearFinished(s).items).toHaveLength(0);
  });
});
