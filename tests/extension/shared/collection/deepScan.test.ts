import { runDeepScan, DEEP_SCAN_DEFAULTS } from '@/extension/shared/collection/deepScan';
import { MediaItem, DeepScanStopReason } from '@/types';

const item = (src: string): MediaItem =>
  ({ src, alt: '', width: 0, height: 0, type: 'jpeg', fileSize: 0, isBase64: false, kind: 'image' });

function makeDeps(rounds: MediaItem[][]) {
  let i = 0, restored = false, t = 0;
  let lastReason: DeepScanStopReason | undefined;
  const progress: number[] = [];
  return {
    deps: {
      collect: () => rounds[Math.min(i, rounds.length - 1)] ?? [],
      scrollStep: () => { i++; },
      atBottom: () => i >= rounds.length,
      waitForQuiet: async () => { t += 100; },
      onProgress: (found: number, _scrolls: number, _elapsed: number, reason?: DeepScanStopReason) => {
        progress.push(found);
        if (reason) lastReason = reason;
      },
      now: () => t,
      restoreScroll: () => { restored = true; },
    },
    state: () => ({ restored, progress, lastReason }),
  };
}

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
});
