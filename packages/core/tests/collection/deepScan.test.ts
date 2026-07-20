import { runDeepScan, DEEP_SCAN_DEFAULTS, ADAPT_WINDOW, ADAPT_STEP, stepMultiplier, ADAPT_CONTINUE } from '@mbd/core/collection/deepScan';
import { MediaItem, DeepScanStopReason } from '@mbd/core/types';

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
      waitForQuiet: async () => { t += 100; return { roots: null, settleMs: 0 }; },
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
  const fbB = item('https://scontent-b.xx.fbcdn.net/v/t1/x_n.jpg?oh=B&oe=2');
  const { deps } = makeDeps([[fbA], [fbB], []]);
  const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 2, signal: new AbortController().signal });
  expect(out).toHaveLength(1);
});

it('upgrades a mediaKey item in place across rounds (thumbnail → original), not double-counted', async () => {
  const thumb = { ...item('https://scontent-a.xx.fbcdn.net/thumb.jpg'), mediaKey: 'fb:123' };
  const orig = { ...item('https://scontent-b.xx.fbcdn.net/original.jpg'), mediaKey: 'fb:123' };
  const { deps } = makeDeps([[thumb], [orig], []]);
  const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 2, signal: new AbortController().signal });
  expect(out).toHaveLength(1);
  expect(out[0].src).toBe(orig.src);
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
  expect(out.length).toBeLessThanOrEqual(4);
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
    const { deps, state } = makeDeps([], (i) => {
      if (i > 0) throw new Error('DOM exploded');
      return many;
    });
    const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, idleRounds: 5, maxScrolls: 5, signal: new AbortController().signal });
    expect(state().lastReason).toBe('error');
    expect(out.map((m) => m.src).sort()).toEqual(['a0', 'a1', 'a2']);
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
    const ac = new AbortController();
    let lastReason: DeepScanStopReason | undefined;
    let restored = false;
    const deps = {
      collect: () => [item('a')],
      scrollStep: () => {},
      atBottom: () => false,
      waitForQuiet: async () => { ac.abort(); return { roots: null, settleMs: 0 }; },
      onProgress: (_f: number, _s: number, _e: number, reason?: DeepScanStopReason) => {
        if (reason) lastReason = reason;
      },
      now: () => 0,
      restoreScroll: () => { restored = true; },
    };
    const out = await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, signal: ac.signal });
    expect(lastReason).toBe('aborted');
    expect(out.map((m) => m.src)).toEqual(['a']);
    expect(restored).toBe(true);
  });

  it('reports "max-items" when a mid-scan round (not the seed) crosses the cap', async () => {
    let i = 0;
    let lastReason: DeepScanStopReason | undefined;
    const deps = {
      collect: () => (i === 0 ? [item('a')] : [item('a'), item('b'), item('c'), item('d')]),
      scrollStep: () => { i++; },
      atBottom: () => false,
      waitForQuiet: async () => ({ roots: null, settleMs: 0 }),
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

it('seeds with a full walk (no roots) and passes mutated roots to later rounds', async () => {
  const calls: Array<readonly unknown[] | undefined> = [];
  const rootsForRound1 = [{ tag: 'subtree-A' }] as const;
  let round = 0;
  const deps = {
    collect: (scanRoots?: readonly unknown[]) => {
      calls.push(scanRoots);
      if (round === 0) return [{ src: 'https://c/seed.jpg' } as any];
      if (round === 1) return [{ src: 'https://c/r1.jpg' } as any];
      return [];
    },
    scrollStep: () => {},
    atBottom: () => false,
    waitForQuiet: async () => {
      round++;
      return { roots: round === 1 ? rootsForRound1 : null, settleMs: 0 };
    },
    onProgress: () => {},
    now: () => 0,
    restoreScroll: () => {},
  };
  await runDeepScan(deps as any, { maxScrolls: 5, maxMs: 999999, maxItems: 1000, idleRounds: 1, signal: new AbortController().signal });

  expect(calls[0]).toBeUndefined();
  expect(calls[1]).toBe(rootsForRound1);
  expect(calls[2]).toBeUndefined();
});

it('adapts the quiet window from an EMA of observed settle time, within bounds', async () => {
  const windows: Array<{ quiet: number; hardCap: number }> = [];
  let round = 0;
  const deps = {
    collect: () => (round === 0 ? [{ src: 'https://c/s.jpg' } as any] : round < 3 ? [{ src: `https://c/${round}.jpg` } as any] : []),
    scrollStep: () => {},
    atBottom: () => false,
    waitForQuiet: async (_s: AbortSignal, window: { quiet: number; hardCap: number }) => {
      windows.push(window);
      round++;
      return { roots: null, settleMs: 5000 };
    },
    onProgress: () => {},
    now: () => 0,
    restoreScroll: () => {},
  };
  await runDeepScan(deps as any, { maxScrolls: 6, maxMs: 1e9, maxItems: 1000, idleRounds: 3, signal: new AbortController().signal });

  expect(windows[0]).toEqual({ quiet: ADAPT_WINDOW.defaultQuiet, hardCap: ADAPT_WINDOW.defaultHardCap });
  for (const w of windows.slice(1)) {
    expect(w.quiet).toBeGreaterThanOrEqual(ADAPT_WINDOW.quietMin);
    expect(w.quiet).toBeLessThanOrEqual(ADAPT_WINDOW.quietMax);
    expect(w.hardCap).toBeLessThanOrEqual(ADAPT_WINDOW.hardCapMax);
  }
  const last = windows[windows.length - 1];
  expect(last.quiet).toBe(ADAPT_WINDOW.quietMax);
  expect(last.hardCap).toBe(ADAPT_WINDOW.hardCapMax);
});

it('stepMultiplier scales by yield within [min,max]', () => {
  expect(stepMultiplier(0)).toBe(ADAPT_STEP.zeroMultiplier);
  expect(stepMultiplier(ADAPT_STEP.denseYield)).toBe(ADAPT_STEP.denseMultiplier);
  expect(stepMultiplier(3)).toBe(ADAPT_STEP.normalMultiplier);
  for (const a of [0, 1, 15, 100]) {
    expect(stepMultiplier(a)).toBeGreaterThanOrEqual(ADAPT_STEP.min);
    expect(stepMultiplier(a)).toBeLessThanOrEqual(ADAPT_STEP.max);
  }
});

it('passes the previous round\'s yield as the next scroll multiplier (1.0 first)', async () => {
  const mults: number[] = [];
  let round = 0;
  const yields = [20, 0, 3];
  const deps = {
    collect: () => {
      const n = round === 0 ? 1 : (yields[round - 1] ?? 0);
      round++;
      return Array.from({ length: n }, (_v, i) => ({ src: `https://c/${round}-${i}.jpg` } as any));
    },
    scrollStep: (m: number) => { mults.push(m); },
    atBottom: () => false,
    waitForQuiet: async () => ({ roots: null, settleMs: 0 }),
    onProgress: () => {},
    now: () => 0,
    restoreScroll: () => {},
  };
  await runDeepScan(deps as any, { maxScrolls: 4, maxMs: 1e9, maxItems: 1000, idleRounds: 3, signal: new AbortController().signal });

  expect(mults[0]).toBe(1.0);
  expect(mults[1]).toBe(stepMultiplier(20));
  expect(mults[2]).toBe(stepMultiplier(0));
});

describe('final full-walk safety sweep', () => {
  it('runs a closing full-document walk on natural completion, catching media only a full walk sees (e.g. inside a pre-existing shadow root)', async () => {
    let mutated = false;
    const deps = {
      collect: (scanRoots?: readonly unknown[]) =>
        scanRoots === undefined
          ? (mutated ? [item('seed'), item('shadow-only')] : [item('seed')])
          : [], // incremental round: never finds the shadow-root item
      scrollStep: () => {},
      atBottom: () => false,
      waitForQuiet: async () => { mutated = true; return { roots: [{ tag: 'subtree' }], settleMs: 0 }; },
      onProgress: () => {},
      now: () => 0,
      restoreScroll: () => {},
    };
    const out = await runDeepScan(deps as any, { ...DEEP_SCAN_DEFAULTS, idleRounds: 1, signal: new AbortController().signal });
    expect(out.map((m) => m.src)).toContain('shadow-only');
  });

  it('does not run the closing sweep when the loop stops on a cap instead of completing naturally', async () => {
    let mutated = false;
    const deps = {
      collect: (scanRoots?: readonly unknown[]) =>
        scanRoots === undefined
          ? (mutated ? [item('seed'), item('shadow-only')] : [item('seed')])
          : [item('extra')], // keeps every round non-idle so the loop runs until the cap
      scrollStep: () => {},
      atBottom: () => false,
      waitForQuiet: async () => { mutated = true; return { roots: [{ tag: 'subtree' }], settleMs: 0 }; },
      onProgress: () => {},
      now: () => 0,
      restoreScroll: () => {},
    };
    const out = await runDeepScan(deps as any, { ...DEEP_SCAN_DEFAULTS, maxItems: 2, signal: new AbortController().signal });
    expect(out.map((m) => m.src)).not.toContain('shadow-only');
  });

  it('resolves with the already-gathered items (not rejected, not empty) when the closing sweep itself throws', async () => {
    let fullWalkCalls = 0;
    const deps = {
      collect: (scanRoots?: readonly unknown[]) => {
        if (scanRoots === undefined) {
          fullWalkCalls++;
          if (fullWalkCalls === 1) return [item('seed')];
          throw new Error('closing sweep exploded');
        }
        return [];
      },
      scrollStep: () => {},
      atBottom: () => false,
      waitForQuiet: async () => ({ roots: [{ tag: 'subtree' }], settleMs: 0 }), // never null, so never the abort/full-walk fallback
      onProgress: () => {},
      now: () => 0,
      restoreScroll: () => {},
    };
    const out = await runDeepScan(deps as any, { ...DEEP_SCAN_DEFAULTS, idleRounds: 1, signal: new AbortController().signal });
    expect(out.map((m) => m.src)).toEqual(['seed']);
  });
});

describe('runDeepScan — learned-scan seed', () => {
  function seedDeps(perRound: number, settleMs = 100) {
    const windows: Array<{ quiet: number; hardCap: number }> = [];
    let n = 0;
    const scrollStep = vi.fn();
    const deps = {
      collect: () => {
        const items: MediaItem[] = [];
        for (let i = 0; i < perRound; i++) items.push(item(`https://x/${n}-${i}.jpg`));
        n++;
        return items;
      },
      scrollStep,
      atBottom: () => false,
      waitForQuiet: async (_sig: AbortSignal, w: { quiet: number; hardCap: number }) => {
        windows.push(w);
        return { roots: null, settleMs };
      },
      onProgress: () => {},
      now: () => 0,
      restoreScroll: () => {},
    };
    return { deps, windows, scrollStep };
  }

  it('with NO seed, round 1 uses the fixed default window (byte-for-byte today)', async () => {
    const { deps, windows } = seedDeps(1);
    await runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, maxScrolls: 2, signal: new AbortController().signal });
    expect(windows[0]).toEqual({ quiet: ADAPT_WINDOW.defaultQuiet, hardCap: ADAPT_WINDOW.defaultHardCap });
  });

  it('with a seed, round 1 uses the seeded-EMA window instead of the fixed default', async () => {
    const { deps, windows } = seedDeps(1);
    await runDeepScan(deps, {
      ...DEEP_SCAN_DEFAULTS, maxScrolls: 2, seed: { settleMs: 800, scrolls: 0 },
      signal: new AbortController().signal,
    });
    expect(windows[0]).toEqual({ quiet: 1200, hardCap: 2400 });
  });

  it('scroll-depth seed RAISES the cap for a moderately-yielding page (no auto-extend)', async () => {
    const noSeed = seedDeps(2);
    await runDeepScan(noSeed.deps, { ...DEEP_SCAN_DEFAULTS, maxScrolls: 5, signal: new AbortController().signal });
    expect(noSeed.scrollStep).toHaveBeenCalledTimes(5);

    const seeded = seedDeps(2);
    await runDeepScan(seeded.deps, {
      ...DEEP_SCAN_DEFAULTS, maxScrolls: 5, seed: { settleMs: 100, scrolls: 10 },
      signal: new AbortController().signal,
    });
    expect(seeded.scrollStep).toHaveBeenCalledTimes(10);
  });

  it('scroll-depth seed NEVER lowers the base cap', async () => {
    const seeded = seedDeps(2);
    await runDeepScan(seeded.deps, {
      ...DEEP_SCAN_DEFAULTS, maxScrolls: 5, seed: { settleMs: 100, scrolls: 1 },
      signal: new AbortController().signal,
    });
    expect(seeded.scrollStep).toHaveBeenCalledTimes(5);
  });

  it('emits the final learned state via onLearned', async () => {
    const { deps } = seedDeps(0);
    const onLearned = vi.fn();
    await runDeepScan({ ...deps, onLearned }, {
      ...DEEP_SCAN_DEFAULTS, maxScrolls: 40, idleRounds: 3, signal: new AbortController().signal,
    });
    expect(onLearned).toHaveBeenCalledTimes(1);
    const arg = onLearned.mock.calls[0][0];
    expect(arg).toMatchObject({ reason: 'complete' });
    expect(typeof arg.settleMs).toBe('number');
    expect(typeof arg.scrolls).toBe('number');
  });
});

describe('dynamic continuation (keep going when rich)', () => {
  function richDeps(perRound: number) {
    let round = 0;
    return {
      collect: () => {
        round++;
        return Array.from({ length: perRound }, (_v, i) => ({ src: `https://c/${round}-${i}.jpg` } as any));
      },
      scrollStep: () => {},
      atBottom: () => false,
      waitForQuiet: async () => ({ roots: null, settleMs: 0 }),
      onProgress: () => {},
      now: () => 0,
      restoreScroll: () => {},
    };
  }

  it('extends past maxScrolls while richly yielding, up to the 2x ceiling', async () => {
    let scrollCalls = 0;
    const deps = richDeps(ADAPT_CONTINUE.richThreshold + 3);
    const wrapped = { ...deps, scrollStep: () => { scrollCalls++; } };
    await runDeepScan(wrapped as any, { maxScrolls: 5, maxMs: 1e9, maxItems: 1e9, idleRounds: 3, signal: new AbortController().signal });
    expect(scrollCalls).toBe(2 * 5);
  });

  it('does NOT extend when yield is below the rich threshold', async () => {
    let scrollCalls = 0;
    const below = Math.max(1, ADAPT_CONTINUE.richThreshold - 1);
    const deps = { ...richDeps(below), scrollStep: () => { scrollCalls++; } };
    await runDeepScan(deps as any, { maxScrolls: 5, maxMs: 1e9, maxItems: 1e9, idleRounds: 3, signal: new AbortController().signal });
    expect(scrollCalls).toBe(5);
  });

  it('maxItems still stops the scan before the extended cap', async () => {
    const deps = richDeps(ADAPT_CONTINUE.richThreshold + 3);
    const out = await runDeepScan(deps as any, { maxScrolls: 5, maxMs: 1e9, maxItems: 10, idleRounds: 3, signal: new AbortController().signal });
    expect(out.length).toBe(10);
  });
});
