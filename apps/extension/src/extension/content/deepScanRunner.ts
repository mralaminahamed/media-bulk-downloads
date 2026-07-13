import { MediaItem } from '@mbd/core/types';
import { collectMedia, type ScanRoot } from '@/extension/content/collect';
import { runDeepScan, DeepScanDeps, DEEP_SCAN_DEFAULTS } from '@mbd/core/collection/deepScan';
import { registrableDomain } from '@mbd/core/collection/paths';
import { loadScanMemoryForHost } from '@mbd/storage/per-host-scan-memory';

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

/**
 * Resolves ~quietWindow.quiet ms after the last DOM mutation (quietWindow.hardCap
 * ms hard cap / abort). Returns the element subtrees that mutated during the wait
 * so a deep-scan round can rescan only those (null to request a full walk — on
 * abort, or when the hard cap fires mid-burst, when the mutation set is
 * unreliable) and the measured settle time (wait-start → last mutation) that
 * feeds the loop's adaptive window for the next round.
 */
export function waitForQuiet(
  signal: AbortSignal,
  quietWindow: { quiet: number; hardCap: number },
): Promise<{ roots: readonly Element[] | null; settleMs: number }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let lastMutationAt = startedAt;
    if (signal.aborted) return resolve({ roots: null, settleMs: 0 });
    const mutated = new Set<Element>();
    let hardCapped = false;
    let quiet: ReturnType<typeof setTimeout>;
    const obs = new MutationObserver((records) => {
      lastMutationAt = Date.now();
      for (const rec of records) {
        if (rec.type === 'childList') {
          rec.addedNodes.forEach((n) => { if (n.nodeType === 1) mutated.add(n as Element); });
        } else if (rec.type === 'attributes' && rec.target.nodeType === 1) {
          mutated.add(rec.target as Element);
        }
      }
      clearTimeout(quiet);
      quiet = setTimeout(done, quietWindow.quiet);
    });
    const hard = setTimeout(() => { hardCapped = true; done(); }, quietWindow.hardCap);
    quiet = setTimeout(done, quietWindow.quiet);
    function done() {
      clearTimeout(quiet);
      clearTimeout(hard);
      obs.disconnect();
      signal.removeEventListener('abort', onAbort);
      const settleMs = lastMutationAt - startedAt;
      resolve({ roots: signal.aborted || hardCapped ? null : [...mutated], settleMs });
    }
    function onAbort() { done(); }
    signal.addEventListener('abort', onAbort, { once: true });
    // document.body can be null very early or on non-HTML documents; fall back to
    // the root element, and if neither exists the hard cap still resolves.
    const target = document.body ?? document.documentElement;
    // Watch attribute mutations too, not just added/removed nodes: most lazy
    // loaders hydrate by swapping data-src → src (or mutating srcset/style) on the
    // SAME node, which is an attribute change with no child added. Without this the
    // quiet timer never resets for those pages and the hard cap can fire before
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
  /** Phase-2: surface the loop's final learned state for persistence. */
  onLearned?: DeepScanDeps['onLearned'];
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
      collect: (scanRoots) => collectMedia(scanRoots as ScanRoot[] | undefined),
      scrollStep: (multiplier: number) => {
        scroller.by(window.innerHeight * multiplier);
        // Also advance any nested scroll pane that lazy-loads its own content,
        // by the same proportion.
        for (const el of nestedScrollables()) el.scrollTop += el.clientHeight * multiplier;
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
      onLearned: opts.onLearned,
    },
  };
}

/** Optional per-scan overrides (from user Settings); unset caps use the defaults. */
export interface StartDeepScanConfig {
  maxItems?: number;
  maxMs?: number;
  maxScrolls?: number;
  clickLoadMore?: boolean;
  /** Phase-2: read/seed/persist this host's learned scan behaviour. */
  rememberScanBehaviour?: boolean;
}

export async function startDeepScan(
  onProgress: DeepScanDeps['onProgress'],
  signal: AbortSignal,
  config: StartDeepScanConfig = {},
): Promise<MediaItem[]> {
  const host = registrableDomain(location.hostname);
  const learn = !!config.rememberScanBehaviour && !!host;

  // Degrade to a cold start if the read fails — never let storage abort a scan.
  const seedMem = learn ? await loadScanMemoryForHost(host).catch(() => null) : null;

  const onLearned: DeepScanDeps['onLearned'] = learn
    ? ({ settleMs, scrolls, reason }) => {
        // Write rule: never persist an aborted/errored run; blend the fresh scroll
        // depth only on a genuine depth signal (complete / hit the scroll cap).
        // A budget-truncated stop (time/items) under-counts depth, so keep the
        // prior remembered value instead of lowering it.
        if (reason === 'aborted' || reason === 'error') return;
        const trustScrolls = reason === 'complete' || reason === 'max-scrolls';
        // Routed through the background (SAVE_SCAN_MEMORY) rather than written
        // directly here: each tab has its own module-local write chain in
        // per-host-scan-memory, so a per-tab write can't share ordering with the
        // background's clear path (#293 phase-2, NEW-1). Fire-and-forget with a
        // .catch — the background may be unavailable (worker suspended /
        // extension reloading); learned memory is best-effort and self-healing.
        void chrome.runtime.sendMessage({
          type: 'SAVE_SCAN_MEMORY',
          host,
          sample: { settleMs, scrolls: trustScrolls ? scrolls : (seedMem?.scrolls ?? scrolls) },
        }).catch(() => { /* background may be unavailable; learned memory is self-healing */ });
      }
    : undefined;

  const { deps } = buildDeepScanDeps(onProgress, {
    clickLoadMore: config.clickLoadMore,
    onLearned,
  });

  return runDeepScan(deps, {
    ...DEEP_SCAN_DEFAULTS,
    // Apply only the caps the user actually set (ignore 0/NaN/undefined).
    ...(config.maxItems ? { maxItems: config.maxItems } : {}),
    ...(config.maxMs ? { maxMs: config.maxMs } : {}),
    ...(config.maxScrolls ? { maxScrolls: config.maxScrolls } : {}),
    ...(seedMem ? { seed: { settleMs: seedMem.settleMs, scrolls: seedMem.scrolls } } : {}),
    signal,
  });
}
