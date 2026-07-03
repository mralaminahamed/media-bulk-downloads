import { MediaItem } from '@/types';
import { collectMedia } from '@/extension/collect';
import { runDeepScan, DeepScanDeps, DEEP_SCAN_DEFAULTS } from '@/extension/shared/deepScan';

/** Finds the element that actually scrolls the page, falling back to window. */
function primaryScroller(): {
  top: () => number;
  by: (dy: number) => void;
  atBottom: () => boolean;
  restore: (y: number) => void;
} {
  const doc = document.scrollingElement || document.documentElement;
  return {
    top: () => window.scrollY || doc.scrollTop,
    by: (dy) => window.scrollBy(0, dy),
    atBottom: () => Math.ceil((window.scrollY || doc.scrollTop) + window.innerHeight) >= doc.scrollHeight,
    restore: (y) => window.scrollTo(0, y),
  };
}

/** Resolves ~400ms after the last DOM mutation, or after a 2s hard cap / abort. */
function waitForQuiet(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    let quiet: ReturnType<typeof setTimeout>;
    const obs = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, 400);
    });
    const hard = setTimeout(done, 2000);
    quiet = setTimeout(done, 400);
    function done() {
      clearTimeout(quiet);
      clearTimeout(hard);
      obs.disconnect();
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

export function buildDeepScanDeps(onProgress: DeepScanDeps['onProgress']): { deps: DeepScanDeps } {
  const scroller = primaryScroller();
  const startY = scroller.top();
  return {
    deps: {
      collect: () => collectMedia(),
      scrollStep: () => scroller.by(window.innerHeight),
      atBottom: () => scroller.atBottom(),
      waitForQuiet,
      onProgress,
      now: () => Date.now(),
      restoreScroll: () => scroller.restore(startY),
    },
  };
}

export function startDeepScan(
  onProgress: DeepScanDeps['onProgress'],
  signal: AbortSignal,
): Promise<MediaItem[]> {
  const { deps } = buildDeepScanDeps(onProgress);
  return runDeepScan(deps, { ...DEEP_SCAN_DEFAULTS, signal });
}
