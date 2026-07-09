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

// HD first — the walk takes the first present key, so order = priority.
export const VIDEO_URL_KEYS = ['playable_url_quality_hd', 'browser_native_hd_url', 'playable_url', 'browser_native_sd_url'];

/**
 * Recursively walk any parsed FB response and emit media by SHAPE, not field
 * name (FB renames/aliases fields constantly). Tracks the nearest ancestor
 * numeric `id` as the FBID owner. Media with no ancestor id is dropped (cannot
 * be keyed to a tile). Untrusted input: every URL is host-pinned via pinFbUrl.
 */
export function extractFbMedia(root: unknown): FbMediaEntry[] {
  const out: FbMediaEntry[] = [];
  const seen = new Set<string>();
  const push = (e: FbMediaEntry): void => {
    const k = `${e.fbid}\n${e.url}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  const walk = (node: unknown, parentKey: string, fbid: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const v of node) walk(v, parentKey, fbid); return; }
    const obj = node as Record<string, unknown>;
    const ownId = typeof obj.id === 'string' && /^\d{1,32}$/.test(obj.id) ? obj.id : fbid;

    // Video: first present pinned video URL key (HD-first priority).
    for (const vk of VIDEO_URL_KEYS) {
      const vurl = pinFbUrl(obj[vk]);
      if (vurl && ownId) {
        const pt = obj.preferred_thumbnail as { image?: { uri?: unknown } } | undefined;
        const poster = pinFbUrl(pt?.image?.uri) ?? undefined;
        const e: FbMediaEntry = { fbid: ownId, kind: 'video', url: vurl, ext: extFromPath(vurl) === 'jpg' ? 'mp4' : extFromPath(vurl) };
        if (poster) e.poster = poster;
        push(e);
        break;
      }
    }

    // Image: this object itself carries uri + width + height, and is not a blur/preview.
    if (!/blur|preview|placeholder|thumbnail/i.test(parentKey)) {
      const iurl = pinFbUrl(obj.uri);
      const w = numOr(obj.width), h = numOr(obj.height);
      if (iurl && w && h && ownId) push({ fbid: ownId, kind: 'image', url: iurl, ext: extFromPath(iurl), width: w, height: h });
    }

    for (const [k, v] of Object.entries(obj)) walk(v, k, ownId);
  };
  walk(root, '', '');
  return keepLargestImagePerFbid(out);
}

/** Per FBID keep only the largest image (originals win over thumbnails); keep all videos. */
function keepLargestImagePerFbid(entries: FbMediaEntry[]): FbMediaEntry[] {
  const bestImg = new Map<string, FbMediaEntry>();
  const rest: FbMediaEntry[] = [];
  for (const e of entries) {
    if (e.kind !== 'image') { rest.push(e); continue; }
    const cur = bestImg.get(e.fbid);
    const area = (e.width ?? 0) * (e.height ?? 0);
    if (!cur || area > (cur.width ?? 0) * (cur.height ?? 0)) bestImg.set(e.fbid, e);
  }
  return [...bestImg.values(), ...rest];
}
