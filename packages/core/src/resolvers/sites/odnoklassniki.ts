import { MediaCandidate } from '@mbd/core/resolvers/types';

/**
 * Host-pin an untrusted URL (read from the page's own player JSON) to the
 * Odnoklassniki video CDN family (`*.okcdn.ru` / `*.mycdn.me`) over https, or
 * null. The URL flows into MediaItem.src and reaches a download sink, so it is
 * never trusted raw.
 */
function pinOkru(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(?:^|\.)(?:okcdn\.ru|mycdn\.me)$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

const OK_HOST_RE = /(?:^|\.)ok\.ru$/i;

/** The video id from an ok.ru watch/embed URL (`/video/<id>` or `/videoembed/<id>`), or null. */
export function okruVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!OK_HOST_RE.test(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/^\/(?:video|videoembed)\/(\d+)(?:[/?#]|$)/i)?.[1] ?? null;
}

/** Progressive-rendition quality rank (higher = better); 0 for unknown names. */
const QUALITY_RANK: Record<string, number> = {
  mobile: 1, lowest: 2, low: 3, sd: 4, hd: 5, full: 6, quad: 7, ultra: 8,
};

interface OkVideo { name?: unknown; url?: unknown }
interface OkMetadata { videos?: OkVideo[] }
interface OkFlashvars { metadata?: unknown }
interface OkOptions { flashvars?: OkFlashvars }

function parseMetadata(flashvarsMeta: unknown): OkMetadata | null {
  if (flashvarsMeta && typeof flashvarsMeta === 'object') return flashvarsMeta as OkMetadata;
  if (typeof flashvarsMeta !== 'string') return null;
  try {
    return JSON.parse(flashvarsMeta) as OkMetadata;
  } catch {
    return null;
  }
}

/**
 * Extract an Odnoklassniki video from a player element's `data-options` JSON
 * (network-free). `flashvars.metadata.videos[]` carries per-quality signed
 * progressive MP4s (`{name, url}`); the highest-ranked rendition is surfaced as a
 * ready single-file video, pinned to the OK video CDN (the JSON is untrusted).
 * Live-only pages (no progressive `videos`, HLS master only) → `[]` (fails
 * closed; no live-gating circumvention).
 */
export function okruMediaFromOptions(optionsJson: string, id?: string | null): MediaCandidate[] {
  if (typeof optionsJson !== 'string') return [];
  let opts: OkOptions;
  try {
    opts = JSON.parse(optionsJson) as OkOptions;
  } catch {
    return [];
  }
  const meta = parseMetadata(opts?.flashvars?.metadata);
  const videos = Array.isArray(meta?.videos) ? meta!.videos : [];

  let best: { rank: number; url: string } | null = null;
  for (const v of videos) {
    const pinned = pinOkru(v?.url);
    if (!pinned) continue;
    const rank = QUALITY_RANK[String(v?.name ?? '').toLowerCase()] ?? 0;
    if (!best || rank > best.rank) best = { rank, url: pinned };
  }
  if (!best) return [];

  const c: MediaCandidate = { url: best.url, kind: 'video', ext: 'mp4' };
  if (id) c.mediaKey = `okru ${id}`;
  return [c];
}

/**
 * Reads the current Odnoklassniki video page's media from the DOM (network-free),
 * for `collectMedia`. Scans every `[data-options]` player element (a page may host
 * ads with their own blob) and returns the first with a usable progressive MP4.
 * No-ops off an ok.ru video page.
 */
export function okruPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  if (okruVideoId(src) === null || typeof document === 'undefined') return [];
  const id = okruVideoId(src);
  for (const el of Array.from(document.querySelectorAll('[data-options]'))) {
    const opts = el.getAttribute('data-options');
    if (!opts) continue;
    const media = okruMediaFromOptions(opts, id);
    if (media.length) return media;
  }
  return [];
}
