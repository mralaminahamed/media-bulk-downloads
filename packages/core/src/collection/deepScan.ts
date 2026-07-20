/**
 * Pure, bounded deep-scan loop. Surfaces media that isn't in the DOM until the
 * page scrolls. All browser interaction is injected via DeepScanDeps so the loop
 * is unit-testable. The extension issues NO network requests here — it only
 * asks the page to scroll and re-reads the DOM.
 */
import { MediaItem, DeepScanStopReason } from '@mbd/core/types';
import { identity } from '@mbd/core/collection/merge';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Adaptive quiet-window bounds. next window is derived from an EMA of the
 *  observed settle time (scroll → last mutation); every value is hard-clamped. */
export const ADAPT_WINDOW = {
  emaWeight: 0.5,        // weight on the newest settle sample
  seedSettleMs: 400,     // EMA starting point
  quietFactor: 1.5, quietMin: 250, quietMax: 1200,
  hardCapFactor: 3, hardCapMin: 1500, hardCapMax: 4000,
  defaultQuiet: 400, defaultHardCap: 2000, // round 1 (no EMA yet)
} as const;

/** Adaptive scroll-step bounds. multiplier = f(previous round's new-item count),
 *  always within [min,max] so the scan never stalls or over-jumps. */
export const ADAPT_STEP = {
  denseYield: 15,          // >= this many new items = dense page
  denseMultiplier: 0.6,    // dense → smaller step (don't skip lazy-mounted content)
  zeroMultiplier: 1.75,    // zero yield → bigger step (cover ground)
  normalMultiplier: 1.0,
  min: 0.5, max: 2.0,
} as const;

/** Scroll-step multiplier for the NEXT round, from the previous round's yield. */
export function stepMultiplier(added: number): number {
  const m = added === 0
    ? ADAPT_STEP.zeroMultiplier
    : added >= ADAPT_STEP.denseYield
      ? ADAPT_STEP.denseMultiplier
      : ADAPT_STEP.normalMultiplier;
  return clamp(m, ADAPT_STEP.min, ADAPT_STEP.max);
}

/** "Keep going when rich": when the scan hits maxScrolls but a round still added
 *  at least `richThreshold` new items (and is under maxMs/maxItems), extend the
 *  scroll cap by `grant`, up to `ceilingFactor × maxScrolls`. */
export const ADAPT_CONTINUE = {
  richThreshold: 5,
  grant: 10,
  ceilingFactor: 2,
} as const;

export interface DeepScanDeps {
  /** Full walk when called with no roots (the seed); otherwise scans only the
   *  given (opaque) subtrees. Roots are passed straight through from
   *  waitForQuiet — the pure loop never inspects them. */
  collect: (scanRoots?: readonly unknown[]) => MediaItem[];
  /** Scrolls by `multiplier` × the viewport; the loop derives the multiplier from
   *  the previous round's yield (sparse → larger, dense → smaller). */
  scrollStep: (multiplier: number) => void;
  atBottom: () => boolean;
  /** Waits until the DOM goes quiet using the given window, returning the mutated
   *  subtrees (or null → full walk on abort / hard cap) and the measured settle
   *  time (scroll → last mutation) that feeds the loop's adaptive window. */
  waitForQuiet: (signal: AbortSignal, quietWindow: { quiet: number; hardCap: number })
    => Promise<{ roots: readonly unknown[] | null; settleMs: number }>;
  onProgress: (found: number, scrolls: number, elapsedMs: number, reason?: DeepScanStopReason) => void;
  now: () => number;
  restoreScroll: () => void;
  /** Emitted once at the end with the run's final learned state, so a caller can
   *  persist it. `reason` lets the caller gate which fields it trusts. */
  onLearned?: (m: { settleMs: number; scrolls: number; reason: DeepScanStopReason }) => void;
}

export interface DeepScanOpts {
  maxScrolls: number;
  maxMs: number;
  maxItems: number;
  idleRounds: number;
  signal: AbortSignal;
  /** Warm-start from a host's learned memory (phase-2). Absent = cold start
   *  (today's behaviour, byte-for-byte). settleMs seeds settleEma; scrolls raises
   *  the starting scroll cap (never lowers it). */
  seed?: { settleMs: number; scrolls: number };
}

export const DEEP_SCAN_DEFAULTS: Omit<DeepScanOpts, 'signal'> = {
  maxScrolls: 40,
  maxMs: 20000,
  maxItems: 1000,
  idleRounds: 3,
};

export async function runDeepScan(deps: DeepScanDeps, opts: DeepScanOpts): Promise<MediaItem[]> {
  const found = new Map<string, MediaItem>();
  const start = deps.now();

  const merge = (scanRoots?: readonly unknown[]): number => {
    let added = 0;
    for (const m of deps.collect(scanRoots)) {
      if (found.size >= opts.maxItems) break;
      const key = identity(m);
      const existing = found.get(key);
      if (!existing) {
        found.set(key, m);
        added++;
      } else if (m.mediaKey) {
        found.set(key, m);
      }
    }
    return added;
  };

  let reason: DeepScanStopReason = 'complete';
  let scrolls: number;
  let completed = 0;
  let settleEma = opts.seed ? clamp(opts.seed.settleMs, 0, ADAPT_WINDOW.hardCapMax) : ADAPT_WINDOW.seedSettleMs;
  let lastAdded: number | null = null;
  const scrollCeiling = ADAPT_CONTINUE.ceilingFactor * opts.maxScrolls;
  let scrollCap = opts.seed
    ? clamp(opts.seed.scrolls, opts.maxScrolls, scrollCeiling)
    : opts.maxScrolls;

  try {
    merge();
    deps.onProgress(found.size, 0, 0);

    let idle = 0;
    for (scrolls = 1; scrolls <= scrollCap; scrolls++) {
      if (opts.signal.aborted) { reason = 'aborted'; break; }
      if (found.size >= opts.maxItems) { reason = 'max-items'; break; }
      if (deps.now() - start >= opts.maxMs) { reason = 'max-time'; break; }

      const quietWindow = (scrolls === 1 && !opts.seed)
        ? { quiet: ADAPT_WINDOW.defaultQuiet, hardCap: ADAPT_WINDOW.defaultHardCap }
        : {
            quiet: clamp(ADAPT_WINDOW.quietFactor * settleEma, ADAPT_WINDOW.quietMin, ADAPT_WINDOW.quietMax),
            hardCap: clamp(ADAPT_WINDOW.hardCapFactor * settleEma, ADAPT_WINDOW.hardCapMin, ADAPT_WINDOW.hardCapMax),
          };
      deps.scrollStep(lastAdded === null ? ADAPT_STEP.normalMultiplier : stepMultiplier(lastAdded));
      const { roots: mutatedRoots, settleMs } = await deps.waitForQuiet(opts.signal, quietWindow);
      settleEma = (1 - ADAPT_WINDOW.emaWeight) * settleEma + ADAPT_WINDOW.emaWeight * settleMs;
      if (opts.signal.aborted) { reason = 'aborted'; break; }
      completed = scrolls;

      const added = merge(mutatedRoots ?? undefined);
      lastAdded = added;
      deps.onProgress(found.size, completed, deps.now() - start);

      if (found.size >= opts.maxItems) { reason = 'max-items'; break; }
      if (added === 0) {
        idle++;
        if (idle >= opts.idleRounds) { reason = 'complete'; break; }
        if (deps.atBottom()) { reason = 'complete'; break; }
      } else {
        idle = 0;
        if (scrolls >= scrollCap && added >= ADAPT_CONTINUE.richThreshold && scrollCap < scrollCeiling) {
          scrollCap = Math.min(scrollCap + ADAPT_CONTINUE.grant, scrollCeiling);
        }
      }
    }
    if (scrolls > scrollCap) reason = 'max-scrolls';
  } catch {
    reason = 'error';
  } finally {
    deps.restoreScroll();
  }

  if (reason === 'complete') {
    try {
      merge();
    } catch {
      /* keep the accumulated `found` set */
    }
  }

  deps.onProgress(found.size, completed, deps.now() - start, reason);
  try { deps.onLearned?.({ settleMs: settleEma, scrolls: completed, reason }); } catch { /* keep result */ }
  return [...found.values()];
}
