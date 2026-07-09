import { MediaItem } from '@/types';
import { collectMedia } from '@/extension/content/collect';
import { hasOriginalFor } from '@/extension/shared/resolvers/sites/facebook';
import {
  runOriginalCapture,
  OriginalCaptureDeps,
  OriginalCaptureResult,
  PhotoTarget,
  ORIGINAL_CAPTURE_DEFAULTS,
} from '@/extension/shared/collection/originalCapture';

// Runner-internal safety constants (see plan Global Constraints). Not user
// settings: pacing and per-photo timeout are safety internals, not knobs.
const PACE_MIN_MS = 1500;
const PACE_MAX_MS = 2000;
const PER_PHOTO_TIMEOUT_MS = 4000;
const POLL_MS = 150;
const MAX_BACK = 3;

/** Distinct {fbid, open} targets from the grid's photo/album anchors. */
export function photoTargetsFromDom(root: ParentNode = document): PhotoTarget[] {
  const seen = new Set<string>();
  const out: PhotoTarget[] = [];
  root.querySelectorAll<HTMLAnchorElement>('a[href*="fbid="], a[href*="/photo/"]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const m = href.match(/[?&]fbid=(\d{6,32})/) || href.match(/\/photo\/(\d{6,32})/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    out.push({ fbid: m[1], open: () => a.click() });
  });
  return out;
}

/** A path+search that is no longer a single-photo viewer route. */
export function isOffPhotoRoute(pathAndSearch: string): boolean {
  return !/\/photo(?:\.php)?\b|[?&]fbid=/.test(pathAndSearch);
}

/** Abortable delay; resolves immediately if already aborted. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const here = (): string => location.pathname + location.search;

/** Poll hasOriginalFor(fbid) until true, timeout, or abort. */
async function waitForCapture(fbid: string, signal: AbortSignal): Promise<boolean> {
  const deadline = Date.now() + PER_PHOTO_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) return false;
    if (hasOriginalFor(fbid)) return true;
    await delay(POLL_MS, signal);
  }
  return hasOriginalFor(fbid);
}

/** history.back() until off the /photo route, bounded so we never loop forever. */
async function closeViewer(signal: AbortSignal): Promise<void> {
  for (let i = 0; i < MAX_BACK; i++) {
    if (isOffPhotoRoute(here())) return;
    history.back();
    // Give the SPA a few polls to swap the route back to the grid.
    for (let p = 0; p < 8 && !isOffPhotoRoute(here()); p++) await delay(POLL_MS, signal);
    if (isOffPhotoRoute(here())) return;
  }
}

/** Bounded scroll to the page bottom so all lazy tiles render before enumerate. */
async function scrollToLoadAll(signal: AbortSignal, maxMs: number): Promise<void> {
  const doc = document.scrollingElement || document.documentElement;
  const start = Date.now();
  let lastH = 0;
  let stable = 0;
  while (stable < 3 && Date.now() - start < maxMs && !signal.aborted) {
    window.scrollTo(0, doc.scrollHeight);
    await delay(800, signal);
    const h = doc.scrollHeight;
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
  }
}

export interface StartCaptureConfig {
  maxPhotos?: number;
  maxMs?: number;
}

function buildDeps(
  onProgress: OriginalCaptureDeps['onProgress'],
): { deps: OriginalCaptureDeps } {
  const startY = window.scrollY || (document.scrollingElement || document.documentElement).scrollTop;
  return {
    deps: {
      enumerate: () => photoTargetsFromDom(document),
      captured: (fbid) => hasOriginalFor(fbid),
      waitForCapture,
      closeViewer,
      pace: (signal) => delay(PACE_MIN_MS + Math.floor(Math.random() * (PACE_MAX_MS - PACE_MIN_MS)), signal),
      onProgress,
      now: () => Date.now(),
      restore: () => window.scrollTo(0, startY),
    },
  };
}

function optsFrom(config: StartCaptureConfig, signal: AbortSignal) {
  return {
    maxPhotos: config.maxPhotos || ORIGINAL_CAPTURE_DEFAULTS.maxPhotos,
    maxMs: config.maxMs || ORIGINAL_CAPTURE_DEFAULTS.maxMs,
    signal,
  };
}

/** Run capture over the tiles already loaded (no scroll). Used by deep-scan chaining. */
export async function runCaptureOnLoadedTiles(
  onProgress: OriginalCaptureDeps['onProgress'],
  signal: AbortSignal,
  config: StartCaptureConfig = {},
): Promise<OriginalCaptureResult> {
  const { deps } = buildDeps(onProgress);
  return runOriginalCapture(deps, optsFrom(config, signal));
}

/** Scroll to load every tile, capture each photo's original, then return the
 *  final collection (the resolver now upgrades every tile to its stored original). */
export async function startOriginalCapture(
  onProgress: OriginalCaptureDeps['onProgress'],
  signal: AbortSignal,
  config: StartCaptureConfig = {},
): Promise<MediaItem[]> {
  const opts = optsFrom(config, signal);
  const { deps } = buildDeps(onProgress);
  await scrollToLoadAll(signal, opts.maxMs);
  await runOriginalCapture(deps, opts);
  return collectMedia();
}
