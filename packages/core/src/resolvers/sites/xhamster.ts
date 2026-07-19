import { MediaCandidate } from '@mbd/core/resolvers/types';

// An xHamster watch page (`xhamster.com/videos/<slug>-<id>`, plus mirror hosts)
// carries one big `window.initials = {…}` JSON global; its
// `videoModel.sources.{mp4, standard.h264[]}` hold the direct mp4 renditions. The
// highest-quality mp4 is surfaced as a single-file download, pinned to the xHamster
// CDN (`*.xhcdn.com`).
function pinXhamster(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(?:^|\.)xhcdn\.com$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

const XH_HOST_RE = /(?:^|\.)xhamster[0-9]*\.(?:com|desi|one)$/i;

/** The video id from an xHamster watch URL (`/videos/<slug>-<id>`), or null. */
export function xhamsterVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!XH_HOST_RE.test(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/\/videos\/(?:.*-)?([a-z0-9]+)(?:[/?#]|$)/i)?.[1] ?? null;
}

// Extract the balanced `{…}` object literal that follows a marker (respecting string
// literals), so a huge nested JSON blob is read whole regardless of `</script>` or
// nesting.
function balancedJsonAfter(html: string, marker: RegExp): string | null {
  const m = marker.exec(html);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < html.length && html[i] !== '{') i++;
  const start = i;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

interface XhH264 {
  url?: unknown;
  quality?: unknown;
}
interface XhVideoModel {
  id?: unknown;
  sources?: {
    mp4?: Record<string, unknown>;
    standard?: { h264?: XhH264[] };
  };
}
interface XhInitials {
  videoModel?: XhVideoModel;
}

function qualityNum(q: unknown): number {
  const n = parseInt(String(q ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extract an xHamster watch page's video from its `window.initials` JSON
 * (network-free). The highest-quality mp4 from `videoModel.sources.mp4`
 * (`{quality: url}`) or `sources.standard.h264[]` (`{url, quality}`) is surfaced as a
 * ready single-file video, pinned to `*.xhcdn.com` (the page JSON is untrusted). No
 * initials / no mp4 source → `[]` (fails closed).
 */
export function xhamsterMediaFromHtml(html: string, id?: string | null): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const blob = balancedJsonAfter(html, /window\.initials\s*=\s*/);
  if (!blob) return [];
  let initials: XhInitials;
  try {
    initials = JSON.parse(blob) as XhInitials;
  } catch {
    return [];
  }
  const sources = initials?.videoModel?.sources;
  if (!sources) return [];

  let best: { q: number; url: string } | null = null;
  const consider = (url: unknown, q: unknown) => {
    const pinned = pinXhamster(url);
    if (!pinned) return;
    const qn = qualityNum(q);
    if (!best || qn > best.q) best = { q: qn, url: pinned };
  };
  for (const [q, url] of Object.entries(sources.mp4 ?? {})) consider(url, q);
  for (const h of sources.standard?.h264 ?? []) consider(h?.url, h?.quality);
  if (!best) return [];

  const vid = id ?? (typeof initials.videoModel?.id === 'string' || typeof initials.videoModel?.id === 'number'
    ? String(initials.videoModel?.id)
    : '');
  const c: MediaCandidate = { url: (best as { url: string }).url, kind: 'video', ext: 'mp4' };
  if (vid) c.mediaKey = `xhamster ${vid}`;
  return [c];
}

/**
 * Reads the current xHamster watch page's video from the DOM (network-free), for
 * `collectMedia`. No-ops off an xHamster watch page.
 */
export function xhamsterPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const id = xhamsterVideoId(src);
  if (id === null || typeof document === 'undefined') return [];
  return xhamsterMediaFromHtml(document.documentElement.innerHTML, id);
}
