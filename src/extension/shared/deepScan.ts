/**
 * Pure, bounded deep-scan loop. Surfaces media that isn't in the DOM until the
 * page scrolls. All browser interaction is injected via DeepScanDeps so the loop
 * is unit-testable. The extension issues NO network requests here — it only
 * asks the page to scroll and re-reads the DOM.
 */
import { MediaItem } from '@/types';

export interface DeepScanDeps {
  collect: () => MediaItem[];
  scrollStep: () => void;
  atBottom: () => boolean;
  waitForQuiet: (signal: AbortSignal) => Promise<void>;
  onProgress: (found: number, scrolls: number, elapsedMs: number) => void;
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
      if (!found.has(m.src)) {
        found.set(m.src, m);
        added++;
      }
    }
    return added;
  };

  try {
    merge(); // seed from the current DOM
    deps.onProgress(found.size, 0, 0);

    let idle = 0;
    for (let scrolls = 1; scrolls <= opts.maxScrolls; scrolls++) {
      if (opts.signal.aborted) break;
      if (found.size >= opts.maxItems) break;
      if (deps.now() - start >= opts.maxMs) break;

      deps.scrollStep();
      await deps.waitForQuiet(opts.signal);
      if (opts.signal.aborted) break;

      const added = merge();
      deps.onProgress(found.size, scrolls, deps.now() - start);

      if (added === 0) {
        idle++;
        if (idle >= opts.idleRounds) break;
        if (deps.atBottom()) break;
      } else {
        idle = 0;
      }
    }
  } finally {
    deps.restoreScroll();
  }

  return [...found.values()];
}
