/**
 * Pure helpers for the Facebook resolver + sniffer. No DOM, no chrome.*, no
 * network — safe in the MAIN realm and unit-testable. FB serves media from
 * signed CDNs (*.fbcdn.net, *.cdninstagram.com) whose size token is covered by
 * the URL signature, so a thumbnail cannot be rewritten to its original. But the
 * page already loads each photo/video's real URL inside its GraphQL responses
 * and hydration JSON; we read the largest one it served rather than forging one.
 */

/** One resolved media, keyed to its owner FBID. */
export interface FbMediaEntry {
  fbid: string;
  kind: 'image' | 'video';
  url: string;
  ext: string;
  width?: number;
  height?: number;
  poster?: string;
  /** A video we only have a cover for yet (no playable URL seen). */
  pending?: boolean;
}

const isFbHost = (h: string): boolean =>
  h === 'fbcdn.net' || h.endsWith('.fbcdn.net') || h === 'cdninstagram.com' || h.endsWith('.cdninstagram.com');

/** Return url only if it is an https fbcdn/cdninstagram URL, else null. Untrusted-input guard. */
export function pinFbUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && isFbHost(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** FBID (digits) from a photo/video/reel URL or path, else null. */
export function fbidFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m =
    url.match(/[?&]fbid=(\d{1,32})/) ||
    url.match(/[?&]v=(\d{1,32})/) ||
    url.match(/\/videos\/(\d{1,32})/) ||
    url.match(/\/reels?\/(\d{1,32})/);
  return m ? m[1] : null;
}

const FB_EXT = /^(?:jpe?g|png|webp|gif|avif|heic|mp4|mov|webm|m4v)$/i;

/** Media extension from the CDN path, else 'jpg'. */
export function extFromPath(path: string): string {
  const m = path.split('?')[0].match(/\.([a-z0-9]{1,5})$/i);
  const ext = m ? m[1].toLowerCase() : '';
  return FB_EXT.test(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg';
}

export function numOr(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}
