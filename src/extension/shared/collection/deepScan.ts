/**
 * Pure, bounded deep-scan loop. Surfaces media that isn't in the DOM until the
 * page scrolls. All browser interaction is injected via DeepScanDeps so the loop
 * is unit-testable. The extension issues NO network requests here — it only
 * asks the page to scroll and re-reads the DOM.
 */
import { MediaItem, DeepScanStopReason } from '@/types';
import { canonicalSrcKey } from './canonical';

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
  waitForQuiet: (signal: AbortSignal, window: { quiet: number; hardCap: number })
    => Promise<{ roots: readonly unknown[] | null; settleMs: number }>;
  // `reason` is passed only on the final call, when the loop has stopped.
  onProgress: (found: number, scrolls: number, elapsedMs: number, reason?: DeepScanStopReason) => void;
  now: () => number;
  restoreScroll: () => void;
}

export interface DeepScanOpts {
  maxScrolls: number;
  maxMs: number;
  maxItems: number;
  idleRounds: number;
  signal: AbortSignal;
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
      // Enforce the ceiling inside the merge — a single round (or the seed) can
      // return far more than maxItems, and the between-rounds guard alone would
      // let `found` blow past the documented cap.
      if (found.size >= opts.maxItems) break;
      // Key by canonical src so a rotating CDN edge host between rounds doesn't
      // re-add the same media as a new item (double-counting + wasted budget).
      const key = canonicalSrcKey(m.src);
      if (!found.has(key)) {
        found.set(key, m);
        added++;
      }
    }
    return added;
  };

  // Why the loop ends. Defaults to a natural finish; each early-exit path sets its
  // own cap reason so the UI can tell "ran dry" apart from "hit a limit".
  let reason: DeepScanStopReason = 'complete';
  // `scrolls` counts loop iterations entered (drives max-scrolls detection);
  // `completed` counts scroll steps actually performed (drives progress reporting),
  // so an exit before the first scrollStep reports 0 rather than 1.
  let scrolls: number; // assigned by the for-init before any read
  let completed = 0;
  let settleEma = ADAPT_WINDOW.seedSettleMs;
  // Drives the NEXT scroll's multiplier: null only before the first scroll
  // (which always steps at the normal 1.0), then the previous round's yield.
  let lastAdded: number | null = null;
  // Dynamic scroll cap: starts at maxScrolls, can be extended (bounded) while the
  // scan is still richly yielding new items. maxMs/maxItems remain hard caps,
  // checked at the loop top before this cap is ever consulted.
  let scrollCap = opts.maxScrolls;
  const scrollCeiling = ADAPT_CONTINUE.ceilingFactor * opts.maxScrolls;

  try {
    merge(); // seed from the current DOM
    deps.onProgress(found.size, 0, 0);

    let idle = 0;
    for (scrolls = 1; scrolls <= scrollCap; scrolls++) {
      if (opts.signal.aborted) { reason = 'aborted'; break; }
      if (found.size >= opts.maxItems) { reason = 'max-items'; break; }
      if (deps.now() - start >= opts.maxMs) { reason = 'max-time'; break; }

      const window = scrolls === 1
        ? { quiet: ADAPT_WINDOW.defaultQuiet, hardCap: ADAPT_WINDOW.defaultHardCap }
        : {
            quiet: clamp(ADAPT_WINDOW.quietFactor * settleEma, ADAPT_WINDOW.quietMin, ADAPT_WINDOW.quietMax),
            hardCap: clamp(ADAPT_WINDOW.hardCapFactor * settleEma, ADAPT_WINDOW.hardCapMin, ADAPT_WINDOW.hardCapMax),
          };
      deps.scrollStep(lastAdded === null ? ADAPT_STEP.normalMultiplier : stepMultiplier(lastAdded));
      const { roots: mutatedRoots, settleMs } = await deps.waitForQuiet(opts.signal, window);
      settleEma = (1 - ADAPT_WINDOW.emaWeight) * settleEma + ADAPT_WINDOW.emaWeight * settleMs;
      if (opts.signal.aborted) { reason = 'aborted'; break; }
      completed = scrolls; // a full scroll step finished this iteration

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
        // Keep going when rich: about to hit the cap but still yielding richly and
        // under the hard caps → grant a bounded extension (maxMs/maxItems still stop
        // first, checked at the loop top).
        if (scrolls >= scrollCap && added >= ADAPT_CONTINUE.richThreshold && scrollCap < scrollCeiling) {
          scrollCap = Math.min(scrollCap + ADAPT_CONTINUE.grant, scrollCeiling);
        }
      }
    }
    // Loop ran to the last iteration without breaking → the scroll cap stopped it.
    if (scrolls > scrollCap) reason = 'max-scrolls';
  } catch {
    // A throw from deps.collect()/scrollStep mid-scan must not discard what we've
    // already gathered — mark the run errored and return the partial set so the
    // popup still gets those items and a surfaced reason instead of an empty list.
    reason = 'error';
  } finally {
    deps.restoreScroll();
  }

  // Final safety sweep: incremental rounds only rescan MutationObserver-visible
  // subtrees, which can't see mutations inside pre-existing shadow roots /
  // same-origin iframes or media reachable only via the seeded page-JSON passes.
  // When the scan finished naturally (not a cap/abort), do ONE full-document walk
  // so the completed result matches a full scan — the incremental speedup is kept
  // for every round up to here; only this closing sweep pays a full walk.
  // A throw from the closing full-walk sweep (it reaches into shadow roots /
  // same-origin iframes) must not discard everything the loop already gathered —
  // same invariant the loop's own try/catch protects. On failure, keep the set.
  if (reason === 'complete') {
    try {
      merge();
    } catch {
      /* keep the accumulated `found` set */
    }
  }

  deps.onProgress(found.size, completed, deps.now() - start, reason);
  return [...found.values()];
}
