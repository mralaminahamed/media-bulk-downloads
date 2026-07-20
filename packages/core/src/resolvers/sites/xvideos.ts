import { MediaCandidate } from '@mbd/core/resolvers/types';

function pinXvideos(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(?:^|\.)xvideos(?:[0-9]*|-cdn)?\.com$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** The video id from an XVideos watch URL (`/video<id>/` or `/video.<id>/`), or null. */
export function xvideosVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!/(?:^|\.)xvideos[0-9]*\.com$/i.test(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/\/video\.?([a-z0-9]+)(?:\/|$)/i)?.[1] ?? null;
}

/**
 * Extract an XVideos watch page's video from its inline player JS (network-free).
 * The `html5player.setVideoUrlHigh('…')` mp4 (else `setVideoUrlLow`) is surfaced as a
 * ready single-file video, pinned to the XVideos CDN (the page JS is untrusted). A
 * page with no player setters (removed/geo-blocked) → `[]` (fails closed).
 */
export function xvideosMediaFromHtml(html: string, id?: string | null): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const high = /html5player\.setVideoUrlHigh\(\s*['"]([^'"]+)['"]\s*\)/i.exec(html)?.[1];
  const low = /html5player\.setVideoUrlLow\(\s*['"]([^'"]+)['"]\s*\)/i.exec(html)?.[1];
  const url = pinXvideos(high) ?? pinXvideos(low);
  if (!url) return [];
  const c: MediaCandidate = { url, kind: 'video', ext: 'mp4' };
  if (id) c.mediaKey = `xvideos ${id}`;
  return [c];
}

/**
 * Reads the current XVideos watch page's video from the DOM (network-free), for
 * `collectMedia`. No-ops off an XVideos watch page.
 */
export function xvideosPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const id = xvideosVideoId(src);
  if (id === null || typeof document === 'undefined') return [];
  return xvideosMediaFromHtml(document.documentElement.innerHTML, id);
}
