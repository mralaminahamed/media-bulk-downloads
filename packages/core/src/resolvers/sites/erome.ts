import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

// An Erome album page: `erome.com/a/<id>` (also `www.`). Its media live on the
// Erome CDN (BunnyCDN-fronted `*.erome.com`).
function isEromeHost(host: string): boolean {
  return host === 'erome.com' || host.endsWith('.erome.com');
}

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

/** The album id from an Erome album URL (`/a/<id>`), or null (not an album page). */
export function eromeAlbumId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isEromeHost(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/^\/a\/([A-Za-z0-9]+)(?:[/?#]|$)/)?.[1] ?? null;
}

// Keep every candidate on the Erome CDN family, so a stray off-site URL in the
// markup (an embed, an ad) can never be surfaced as album media.
function onEromeCdn(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'erome.com' || h.endsWith('.erome.com');
  } catch {
    return false;
  }
}

/**
 * Extract an Erome album's media from its page markup (synchronous, network-free).
 * Each `<div class="media-group">` holds one item: a video ships a
 * `<video><source src=…>`; an image ships a lazy `<img … data-src=…>` (the visible
 * `src` is a placeholder). The originals are the CDN URLs already in the markup —
 * nothing is fetched or forged. A private/removed album renders no media-groups →
 * `[]` (fails closed). Ordered by appearance, deduped by URL.
 */
export function eromeMediaFromHtml(html: string, albumId: string): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  const groups = html.split(/<div\s+class="media-group"/i).slice(1);
  for (const g of groups) {
    // A video group carries a <source src=…>; an image group a lazy data-src=….
    const vid = /<source\b[^>]*\bsrc="([^"]+)"/i.exec(g)?.[1];
    const img = /\bdata-src="([^"]+)"/i.exec(g)?.[1];
    const url = vid ?? img;
    if (!url || seen.has(url) || !onEromeCdn(url)) continue;
    const idx = out.length;
    if (vid && VIDEO_RE.test(url)) {
      seen.add(url);
      out.push({ url, kind: 'video', ext: extensionFromUrl(url) ?? 'mp4', mediaKey: `erome ${albumId} ${idx}` });
      continue;
    }
    const ext = imageExtFromUrl(url);
    if (!ext) continue;
    seen.add(url);
    out.push({ url, kind: ext === 'gif' ? 'gif' : 'image', ext, mediaKey: `erome ${albumId} ${idx}` });
  }
  return out;
}

/**
 * Reads the current Erome album page's media from the DOM (network-free), for
 * `collectMedia`. No-ops off an Erome album page.
 */
export function eromePageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const albumId = eromeAlbumId(src);
  if (!albumId || typeof document === 'undefined') return [];
  return eromeMediaFromHtml(document.documentElement.innerHTML, albumId);
}
