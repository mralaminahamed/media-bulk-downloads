import { MediaItem } from '@/types';
import { collectMedia } from '@/extension/content/collect';
import { runDeepScan, DeepScanDeps, DEEP_SCAN_DEFAULTS } from '@/extension/shared/collection/deepScan';

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

/**
 * Nested scroll containers (overflow:auto/scroll) that still have room to scroll.
 * Some galleries lazy-load inside their own scroll pane rather than the page, so
 * the page scroller alone never advances them. The cheap layout check (scrollHeight
 * vs clientHeight) runs first; computed style is resolved only for elements that
 * actually overflow, keeping this off the expensive path for ordinary elements.
 */
export function nestedScrollables(root: Document | ShadowRoot = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.scrollHeight - el.clientHeight <= 200) return; // not meaningfully scrollable
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) return; // already at bottom
    const oy = window.getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll') out.push(el);
  });
  return out;
}

// Conservative "load more" matcher: only common expander phrasings, so we don't
// click unrelated controls. Matches "load/show/view/see/read more", "load additional",
// and "more results/items/photos/images/posts". "learn more" is deliberately absent —
// it's usually a nav link rather than an in-place expander.
const LOAD_MORE_RE = /\b(load|show|view|see|read)\s+more\b|\bload\s+additional\b|\bmore\s+(results|items|photos|images|posts)\b/i;

/**
 * "Load more"-style buttons on the page. Restricted to real buttons / role=button
 * (never <a href>, which would navigate) that are enabled and whose visible text or
 * aria-label reads as an expander. Used only when the user opts in — clicking page
 * controls can have side effects.
 */
export function findLoadMoreButtons(root: Document | ShadowRoot = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>('button, [role="button"]').forEach((el) => {
    // Never an <a> — even one with role="button" navigates on click, which would
    // tear down the scan. The [role="button"] selector matches such anchors, so
    // exclude them explicitly here rather than trusting the selector alone.
    if (el.tagName === 'A') return;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.trim();
    if (LOAD_MORE_RE.test(label)) out.push(el);
  });
  return out;
}

export interface BuildDeepScanOpts {
  /** Opt-in: click a few "load more" buttons after each scroll step. */
  clickLoadMore?: boolean;
}

// At most this many load-more buttons are clicked per scroll round, so an opt-in
// scan can't fire dozens of clicks at once.
const MAX_LOAD_MORE_CLICKS = 3;

export function buildDeepScanDeps(
  onProgress: DeepScanDeps['onProgress'],
  opts: BuildDeepScanOpts = {},
): { deps: DeepScanDeps } {
  const scroller = primaryScroller();
  const startY = scroller.top();
  return {
    deps: {
      collect: () => collectMedia(),
      scrollStep: () => {
        scroller.by(window.innerHeight);
        // Also advance any nested scroll pane that lazy-loads its own content.
        for (const el of nestedScrollables()) el.scrollTop += el.clientHeight;
        // Opt-in: click a bounded number of "load more" buttons.
        if (opts.clickLoadMore) {
          for (const btn of findLoadMoreButtons().slice(0, MAX_LOAD_MORE_CLICKS)) btn.click();
        }
      },
      atBottom: () => scroller.atBottom(),
      waitForQuiet,
      onProgress,
      now: () => Date.now(),
      restoreScroll: () => scroller.restore(startY),
    },
  };
}

/** Optional per-scan overrides (from user Settings); unset caps use the defaults. */
export interface StartDeepScanConfig {
  maxItems?: number;
  maxMs?: number;
  maxScrolls?: number;
  clickLoadMore?: boolean;
}

export function startDeepScan(
  onProgress: DeepScanDeps['onProgress'],
  signal: AbortSignal,
  config: StartDeepScanConfig = {},
): Promise<MediaItem[]> {
  const { deps } = buildDeepScanDeps(onProgress, { clickLoadMore: config.clickLoadMore });
  return runDeepScan(deps, {
    ...DEEP_SCAN_DEFAULTS,
    // Apply only the caps the user actually set (ignore 0/NaN/undefined).
    ...(config.maxItems ? { maxItems: config.maxItems } : {}),
    ...(config.maxMs ? { maxMs: config.maxMs } : {}),
    ...(config.maxScrolls ? { maxScrolls: config.maxScrolls } : {}),
    signal,
  });
}
