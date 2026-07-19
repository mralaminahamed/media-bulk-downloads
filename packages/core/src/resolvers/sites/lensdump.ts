import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

// A Lensdump image page (`lensdump.com/i/<id>`) exposes the full-resolution original
// in its `og:image` meta tag; the media lives on the Lensdump CDN
// (i*.lensdump.com / w.l3n.co).
const LENSDUMP_PAGE_RE = /(?:^|\.)lensdump\.com$/i;
const LENSDUMP_CDN_RE = /(?:^|\.)(?:lensdump\.com|l3n\.co)$/i;

export interface LensdumpImageRef {
  id: string;
  host: string;
}

/** Parse a Lensdump image URL (`/i/<id>`), or null (not an image page). */
export function lensdumpImageRef(raw: string | URL): LensdumpImageRef | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!LENSDUMP_PAGE_RE.test(host)) return null;
  const m = u.pathname.match(/^\/i\/([A-Za-z0-9]+)(?:[/?#]|$)/);
  if (!m) return null;
  return { id: m[1], host };
}

function ogImage(html: string): string | null {
  return (
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i.exec(html)?.[1] ??
    null
  );
}

function onLensdumpCdn(url: string): boolean {
  try {
    return LENSDUMP_CDN_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Extract a Lensdump image page's original from its markup (network-free). The
 * original is the `og:image` URL when it is a plaintext `https` image on the
 * Lensdump CDN; anything else (placeholder, off-host) is skipped (fails closed). One
 * candidate per page.
 */
export function lensdumpMediaFromHtml(html: string, ref: LensdumpImageRef): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const og = ogImage(html);
  if (!og || !/^https:\/\//i.test(og) || !onLensdumpCdn(og)) return [];
  const ext = imageExtFromUrl(og);
  if (!ext) return [];
  return [{ url: og, kind: ext === 'gif' ? 'gif' : 'image', ext, mediaKey: `lensdump ${ref.id}` }];
}

/**
 * Reads the current Lensdump image page's original from the DOM (network-free), for
 * `collectMedia`. No-ops off a Lensdump image page.
 */
export function lensdumpPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const ref = lensdumpImageRef(src);
  if (!ref || typeof document === 'undefined') return [];
  return lensdumpMediaFromHtml(document.documentElement.innerHTML, ref);
}
