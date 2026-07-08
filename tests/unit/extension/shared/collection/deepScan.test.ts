import { runDeepScan, DEEP_SCAN_DEFAULTS } from '@/extension/shared/collection/deepScan';
import { MediaItem, DeepScanStopReason } from '@/types';

const item = (src: string): MediaItem =>
  ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' });

function makeDeps(rounds: MediaItem[][], collectFn?: (i: number) => MediaItem[]) {
  let i = 0, restored = false, t = 0;
  let lastReason: DeepScanStopReason | undefined;
  let lastScrolls = -1;
  const progress: number[] = [];
  return {
    deps: {
      collect: () => (collectFn ? collectFn(i) : rounds[Math.min(i, rounds.length - 1)] ?? []),
      scrollStep: () => { i++; },
      atBottom: () => i >= rounds.length,
      waitForQuiet: async () => { t += 100; },
      onProgress: (found: number, scrolls: number, _elapsed: number, reason?: DeepScanStopReason) => {
        progress.push(found);
        lastScrolls = scrolls;
        if (reason) lastReason = reason;
      },
      now: () => t,
      restoreScroll: () => { restored = true; },
    },
    state: () => ({ restored, progress, lastReason, lastScrolls }),
  };
}

it('dedups the same image across rounds by canonical key (rotating CDN edge host)', async () => {
  const fbA = item('https://scontent-a.xx.fbcdn.net/v/t1/x_n.jpg?oh=A&oe=1');
  const fbB = item('https://scontent-b.xx.fbcdn.net/v/t1/x_n.jpg?oh=B&oe=2'); // same image, new host + query
  const { deps } = makeDeps([[fbA], [fbB], []]);
  const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 2, signal: new AbortController().signal });
  expect(out).toHaveLength(1);
});

it('stops after idleRounds with no new media and restores scroll', async () => {
  const { deps, state } = makeDeps([[item('a')], [item('a')], [item('a')], [item('a')]]);
  const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 2, signal: new AbortController().signal });
  expect(out.map((m) => m.src)).toEqual(['a']);
  expect(state().restored).toBe(true);
});

it('accumulates and dedups across rounds', async () => {
  const { deps } = makeDeps([[item('a')], [item('a'), item('b')], [item('c')]]);
  const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 5, maxScrolls: 5, signal: new AbortController().signal });
  expect(out.map((m) => m.src).sort()).toEqual(['a', 'b', 'c']);
});

it('aborts promptly via signal', async () => {
  const ac = new AbortController();
  const { deps, state } = makeDeps([[item('a')], [item('b')], [item('c')]]);
  ac.abort();
  await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, signal: ac.signal });
  expect(state().restored).toBe(true);
});

it('stops at maxScrolls', async () => {
  const rounds = Array.from({ length: 100 }, (_, n) => [item(`x${n}`)]);
  const { deps } = makeDeps(rounds);
  const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxScrolls: 3, idleRounds: 99, signal: new AbortController().signal });
  expect(out.length).toBeLessThanOrEqual(4); // seed + up to 3 scrolls
});

it('caps at maxItems even when a single collect returns more', async () => {
  const many = Array.from({ length: 50 }, (_, n) => item(`s${n}`));
  const { deps } = makeDeps([many]);
  const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxItems: 10, signal: new AbortController().signal });
  expect(out.length).toBe(10);
});

describe('stop reason', () => {
  it('reports "complete" when the scan runs dry (idle rounds)', async () => {
    const { deps, state } = makeDeps([[item('a')], [item('a')], [item('a')]]);
    await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 2, signal: new AbortController().signal });
    expect(state().lastReason).toBe('complete');
  });

  it('reports "max-items" when the item cap stops it', async () => {
    const many = Array.from({ length: 50 }, (_, n) => item(`s${n}`));
    const { deps, state } = makeDeps([many]);
    await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxItems: 10, signal: new AbortController().signal });
    expect(state().lastReason).toBe('max-items');
  });

  it('reports "max-scrolls" when every round adds media up to the scroll cap', async () => {
    const rounds = Array.from({ length: 100 }, (_, n) => [item(`x${n}`)]);
    const { deps, state } = makeDeps(rounds);
    await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxScrolls: 3, idleRounds: 99, signal: new AbortController().signal });
    expect(state().lastReason).toBe('max-scrolls');
  });

  it('reports "max-time" when the time cap stops it', async () => {
    const rounds = Array.from({ length: 100 }, (_, n) => [item(`t${n}`)]);
    const { deps, state } = makeDeps(rounds);
    // waitForQuiet advances the clock 100ms per round; maxMs 150 trips on round 3.
    await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxMs: 150, maxScrolls: 99, idleRounds: 99, signal: new AbortController().signal });
    expect(state().lastReason).toBe('max-time');
  });

  it('reports "aborted" when the signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const { deps, state } = makeDeps([[item('a')], [item('b')]]);
    await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, signal: ac.signal });
    expect(state().lastReason).toBe('aborted');
  });

  it('reports "error" and returns the partial set when collect throws mid-scan', async () => {
    const many = Array.from({ length: 3 }, (_, n) => item(`a${n}`));
    // Seed succeeds; the first post-scroll collect (i>0) throws.
    const { deps, state } = makeDeps([], (i) => {
      if (i > 0) throw new Error('DOM exploded');
      return many;
    });
    const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 5, maxScrolls: 5, signal: new AbortController().signal });
    expect(state().lastReason).toBe('error');
    expect(out.map((m) => m.src).sort()).toEqual(['a0', 'a1', 'a2']); // seed preserved
    expect(state().restored).toBe(true);
  });

  it('reports 0 scroll steps when the seed already fills the item cap (no scrollStep ran)', async () => {
    const many = Array.from({ length: 50 }, (_, n) => item(`s${n}`));
    const { deps, state } = makeDeps([many]);
    await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxItems: 10, signal: new AbortController().signal });
    expect(state().lastReason).toBe('max-items');
    expect(state().lastScrolls).toBe(0);
  });

  it('reports "aborted" when the signal aborts DURING the quiet-wait (mid-scroll)', async () => {
    // The loop-top guard can't catch this: the signal is still live when the
    // iteration begins, the scroll fires, and only then does waitForQuiet abort —
    // so the post-scroll guard is the one that must stop the loop. `completed`
    // stays 0 because the scroll step never fully finished.
    const ac = new AbortController();
    let lastReason: DeepScanStopReason | undefined;
    let restored = false;
    const deps = {
      collect: () => [item('a')],
      scrollStep: () => {},
      atBottom: () => false,
      waitForQuiet: async () => { ac.abort(); },
      onProgress: (_f: number, _s: number, _e: number, reason?: DeepScanStopReason) => {
        if (reason) lastReason = reason;
      },
      now: () => 0,
      restoreScroll: () => { restored = true; },
    };
    const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, signal: ac.signal });
    expect(lastReason).toBe('aborted');
    expect(out.map((m) => m.src)).toEqual(['a']); // seed preserved
    expect(restored).toBe(true);
  });

  it('reports "max-items" when a mid-scan round (not the seed) crosses the cap', async () => {
    // The seed stays under the cap; the first post-scroll round pushes over it, so
    // the ceiling is detected AFTER the merge rather than by the loop-top guard.
    let i = 0;
    let lastReason: DeepScanStopReason | undefined;
    const deps = {
      collect: () => (i === 0 ? [item('a')] : [item('a'), item('b'), item('c'), item('d')]),
      scrollStep: () => { i++; },
      atBottom: () => false,
      waitForQuiet: async () => {},
      onProgress: (_f: number, _s: number, _e: number, reason?: DeepScanStopReason) => {
        if (reason) lastReason = reason;
      },
      now: () => 0,
      restoreScroll: () => {},
    };
    const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxItems: 3, signal: new AbortController().signal });
    expect(lastReason).toBe('max-items');
    expect(out.length).toBe(3);
  });
});
