import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

// A Motherless media page (`motherless.com/<id>`) carries its media URL in a
// `__fileurl = '…'` JS variable; the media lives on the Motherless CDN
// (*.motherlessmedia.com). Pin every URL to that family — the page JS is untrusted.
function pinMotherless(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(?:^|\.)motherless(?:media)?\.com$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

/** The media id from a Motherless media URL (single path segment `/<id>`), or null. */
export function motherlessMediaId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!/(?:^|\.)motherless\.com$/i.test(u.hostname.toLowerCase())) return null;
  // A single-segment path is a media/gallery page; the `__fileurl` presence is the
  // real gate (a gallery/group/user page carries none → fails closed).
  return u.pathname.match(/^\/([0-9A-Za-z]+)\/?$/)?.[1] ?? null;
}

/**
 * Extract a Motherless media page's file from its markup (network-free). The media
 * URL is the `__fileurl` JS variable, pinned to the Motherless CDN (the page JS is
 * untrusted) and classified by extension (image/gif/video). A page without
 * `__fileurl` (a gallery/group listing, or removed media) → `[]` (fails closed).
 */
export function motherlessMediaFromHtml(html: string, id: string): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const raw = /__fileurl\s*=\s*['"]([^'"]+)['"]/.exec(html)?.[1];
  const url = pinMotherless(raw);
  if (!url) return [];
  const mediaKey = `motherless ${id}`;
  const img = imageExtFromUrl(url);
  if (img) return [{ url, kind: img === 'gif' ? 'gif' : 'image', ext: img, mediaKey }];
  if (VIDEO_RE.test(url)) return [{ url, kind: 'video', ext: extensionFromUrl(url) ?? 'mp4', mediaKey }];
  return [];
}

/**
 * Reads the current Motherless media page's file from the DOM (network-free), for
 * `collectMedia`. No-ops off a Motherless media page.
 */
export function motherlessPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const id = motherlessMediaId(src);
  if (!id || typeof document === 'undefined') return [];
  return motherlessMediaFromHtml(document.documentElement.innerHTML, id);
}
