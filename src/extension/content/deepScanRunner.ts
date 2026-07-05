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
    // document.body can be null very early or on non-HTML documents; fall back to
    // the root element, and if neither exists the 2s hard cap still resolves.
    const target = document.body ?? document.documentElement;
    // Watch attribute mutations too, not just added/removed nodes: most lazy
    // loaders hydrate by swapping data-src → src (or mutating srcset/style) on the
    // SAME node, which is an attribute change with no child added. Without this the
    // quiet timer never resets for those pages and the 2s hard cap can fire before
    // images finish committing their real URLs.
    if (target) {
      obs.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'style', 'data-src'],
      });
    }
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
