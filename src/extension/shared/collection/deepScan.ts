/**
 * Pure, bounded deep-scan loop. Surfaces media that isn't in the DOM until the
 * page scrolls. All browser interaction is injected via DeepScanDeps so the loop
 * is unit-testable. The extension issues NO network requests here — it only
 * asks the page to scroll and re-reads the DOM.
 */
import { MediaItem, DeepScanStopReason } from '@/types';
import { canonicalSrcKey } from './canonical';

export interface DeepScanDeps {
  collect: () => MediaItem[];
  scrollStep: () => void;
  atBottom: () => boolean;
  waitForQuiet: (signal: AbortSignal) => Promise<void>;
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

  const merge = (): number => {
    let added = 0;
    for (const m of deps.collect()) {
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

  try {
    merge(); // seed from the current DOM
    deps.onProgress(found.size, 0, 0);

    let idle = 0;
    for (scrolls = 1; scrolls <= opts.maxScrolls; scrolls++) {
      if (opts.signal.aborted) { reason = 'aborted'; break; }
      if (found.size >= opts.maxItems) { reason = 'max-items'; break; }
      if (deps.now() - start >= opts.maxMs) { reason = 'max-time'; break; }

      deps.scrollStep();
      await deps.waitForQuiet(opts.signal);
      if (opts.signal.aborted) { reason = 'aborted'; break; }
      completed = scrolls; // a full scroll step finished this iteration

      const added = merge();
      deps.onProgress(found.size, completed, deps.now() - start);

      if (found.size >= opts.maxItems) { reason = 'max-items'; break; }
      if (added === 0) {
        idle++;
        if (idle >= opts.idleRounds) { reason = 'complete'; break; }
        if (deps.atBottom()) { reason = 'complete'; break; }
      } else {
        idle = 0;
      }
    }
    // Loop ran to the last iteration without breaking → the scroll cap stopped it.
    if (scrolls > opts.maxScrolls) reason = 'max-scrolls';
  } catch {
    // A throw from deps.collect()/scrollStep mid-scan must not discard what we've
    // already gathered — mark the run errored and return the partial set so the
    // popup still gets those items and a surfaced reason instead of an empty list.
    reason = 'error';
  } finally {
    deps.restoreScroll();
  }

  deps.onProgress(found.size, completed, deps.now() - start, reason);
  return [...found.values()];
}
