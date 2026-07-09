import { describe, it, expect, vi } from 'vitest';
import { runOriginalCapture, OriginalCaptureDeps, PhotoTarget } from '@/extension/shared/collection/originalCapture';

function makeDeps(over: Partial<OriginalCaptureDeps> = {}, targets: PhotoTarget[] = []): OriginalCaptureDeps {
  return {
    enumerate: () => targets,
    captured: () => false,
    waitForCapture: async () => true,
    closeViewer: async () => {},
    pace: async () => {},
    onProgress: () => {},
    now: () => 0,
    restore: () => {},
    ...over,
  };
}
const targets = (...ids: string[]): PhotoTarget[] => ids.map((fbid) => ({ fbid, open: vi.fn() }));
const opts = (over = {}) => ({ maxPhotos: 60, maxMs: 180000, signal: new AbortController().signal, ...over });

describe('runOriginalCapture', () => {
  it('opens every uncaptured target and reports complete', async () => {
    const close = vi.fn(async () => {});
    const pace = vi.fn(async () => {});
    const restore = vi.fn();
    const ts = targets('1', '2', '3');
    const r = await runOriginalCapture(makeDeps({ closeViewer: close, pace, restore }, ts), opts());
    expect(r).toEqual({ opened: 3, captured: 3, skipped: 0, stoppedBy: 'complete' });
    ts.forEach((t) => expect(t.open).toHaveBeenCalledOnce());
    expect(close).toHaveBeenCalledTimes(3);
    expect(pace).toHaveBeenCalledTimes(3);
    expect(restore).toHaveBeenCalledOnce();
  });

  it('skips a target whose original is already captured (no open, not counted against maxPhotos)', async () => {
    const ts = targets('1', '2');
    const r = await runOriginalCapture(makeDeps({ captured: (id) => id === '1' }, ts), opts());
    expect(ts[0].open).not.toHaveBeenCalled();
    expect(ts[1].open).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ opened: 1, captured: 1, skipped: 1, stoppedBy: 'complete' });
  });

  it('counts a per-photo timeout as opened-but-not-captured and keeps going', async () => {
    const ts = targets('1', '2');
    const r = await runOriginalCapture(makeDeps({ waitForCapture: async (id) => id === '2' }, ts), opts());
    expect(r).toMatchObject({ opened: 2, captured: 1, stoppedBy: 'complete' });
  });

  it('stops at maxPhotos', async () => {
    const ts = targets('1', '2', '3', '4', '5');
    const r = await runOriginalCapture(makeDeps({}, ts), opts({ maxPhotos: 2 }));
    expect(r).toMatchObject({ opened: 2, stoppedBy: 'max-photos' });
  });

  it('stops at maxMs', async () => {
    let t = 0;
    const ts = targets('1', '2', '3');
    const r = await runOriginalCapture(makeDeps({ now: () => (t += 100000) }, ts), opts({ maxMs: 150000 }));
    expect(r.stoppedBy).toBe('max-time');
  });

  it('aborts mid-loop, closes the viewer, restores, returns partial', async () => {
    const ac = new AbortController();
    const close = vi.fn(async () => {});
    const restore = vi.fn();
    const ts = targets('1', '2', '3');
    const r = await runOriginalCapture(
      makeDeps({ closeViewer: close, restore, waitForCapture: async () => { ac.abort(); return true; } }, ts),
      opts({ signal: ac.signal }),
    );
    expect(r.stoppedBy).toBe('aborted');
    expect(close).toHaveBeenCalled();
    expect(restore).toHaveBeenCalledOnce();
    expect(r.opened).toBe(1);
  });

  it('marks error and restores when a step throws', async () => {
    const restore = vi.fn();
    const ts = targets('1');
    const r = await runOriginalCapture(makeDeps({ restore, waitForCapture: async () => { throw new Error('boom'); } }, ts), opts());
    expect(r.stoppedBy).toBe('error');
    expect(restore).toHaveBeenCalledOnce();
  });

  it('final onProgress carries the stop reason', async () => {
    const onProgress = vi.fn();
    await runOriginalCapture(makeDeps({ onProgress }, targets('1')), opts());
    const last = onProgress.mock.calls.at(-1);
    expect(last?.[3]).toBe('complete');
  });
});
