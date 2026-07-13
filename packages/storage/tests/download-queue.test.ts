import { describe, it, expect } from 'vitest';
import {
  emptyQueue, enqueue, claimNext, activeCount, markActive, markDone,
  markFailed, scheduleRetry, cancel, retryFailed, clearFinished,
  backoffMs, MAX_ATTEMPTS, setProgress, retryAllFailed, FINISHED_CAP,
} from '@mbd/storage/download-queue';
import type { QueueState, QueueItem } from '@mbd/storage/download-queue';

const T0 = 1_000_000;

describe('download-queue reducer', () => {
  it('enqueue caps finished (done/failed) items at FINISHED_CAP but keeps every live one', () => {
    const finished: QueueItem[] = Array.from({ length: FINISHED_CAP + 50 }, (_, i) => ({
      id: `d${i}`, url: `https://x/${i}.jpg`, filename: `${i}.jpg`, status: 'done' as const,
      attempts: 1, readyAt: T0, addedAt: T0 + i,
    }));
    const live: QueueItem[] = [
      { id: 'q1', url: 'https://x/live.jpg', filename: 'live.jpg', status: 'queued', attempts: 0, readyAt: T0, addedAt: T0 },
    ];
    const s = enqueue({ items: [...finished, ...live], paused: false }, [{ url: 'https://x/new.jpg', filename: 'new.jpg' }], T0 + 9999);
    const done = s.items.filter((i) => i.status === 'done');
    expect(done).toHaveLength(FINISHED_CAP);            // oldest 50 finished dropped
    expect(done.every((i) => i.addedAt >= T0 + 50)).toBe(true); // newest kept
    expect(s.items.filter((i) => i.status === 'queued')).toHaveLength(2); // both live items survive
  });

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

  it('markFailed flags hotlink 403s (opt-in retry) but not ordinary failures', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }, { url: 'u2', filename: 'f2' }], T0);
    expect(markFailed(s, s.items[0].id, 'SERVER_FORBIDDEN', true).items[0].hotlink).toBe(true);
    expect(markFailed(s, s.items[1].id, 'boom').items[1].hotlink).toBeUndefined();
  });

  it('retryFailed can arm the Referer rewrite and clears the hotlink flag', () => {
    let s = emptyQueue();
    s = enqueue(s, [{ url: 'u1', filename: 'f1' }], T0);
    s = markFailed(s, s.items[0].id, 'SERVER_FORBIDDEN', true);
    const plain = retryFailed(s, s.items[0].id, T0 + 5);
    expect(plain.items[0]).toMatchObject({ status: 'queued', hotlink: undefined, useReferer: undefined });
    const withReferer = retryFailed(s, s.items[0].id, T0 + 5, true);
    expect(withReferer.items[0]).toMatchObject({ status: 'queued', hotlink: undefined, useReferer: true });
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

describe('setProgress', () => {
  const base = (): QueueState => ({
    paused: false,
    items: [
      { id: 'a', url: 'u1', filename: 'a.jpg', status: 'active', attempts: 0, readyAt: 0, addedAt: 0, downloadId: 11 },
      { id: 'b', url: 'u2', filename: 'b.jpg', status: 'queued', attempts: 0, readyAt: 0, addedAt: 0 },
    ],
  });
  it('patches the active item matching the downloadId', () => {
    const out = setProgress(base(), 11, 500, 1000);
    expect(out.items[0]).toMatchObject({ id: 'a', bytesReceived: 500, totalBytes: 1000 });
  });
  it('returns the SAME state ref when no active item matches (no-op write skip)', () => {
    const s = base();
    expect(setProgress(s, 999, 1, 2)).toBe(s);
  });
  it('returns the SAME state ref when the bytes did not change', () => {
    const s = setProgress(base(), 11, 500, 1000);
    expect(setProgress(s, 11, 500, 1000)).toBe(s);
  });
});

describe('retryAllFailed', () => {
  it('re-queues every failed item and leaves others untouched', () => {
    const s: QueueState = { paused: false, items: [
      { id: 'a', url: 'u', filename: 'a', status: 'failed', attempts: 3, error: 'x', hotlink: true, readyAt: 0, addedAt: 0, bytesReceived: 9, totalBytes: 9 },
      { id: 'b', url: 'u', filename: 'b', status: 'done', attempts: 0, readyAt: 0, addedAt: 0 },
      { id: 'c', url: 'u', filename: 'c', status: 'failed', attempts: 1, error: 'y', readyAt: 0, addedAt: 0 },
    ] };
    const out = retryAllFailed(s, 1000);
    expect(out.items[0]).toMatchObject({ id: 'a', status: 'queued', attempts: 0, readyAt: 1000 });
    expect(out.items[0].error).toBeUndefined();
    expect(out.items[0].hotlink).toBeUndefined();
    expect(out.items[0].bytesReceived).toBeUndefined();
    expect(out.items[1].status).toBe('done'); // untouched
    expect(out.items[2]).toMatchObject({ id: 'c', status: 'queued', attempts: 0 });
  });
});
