/**
 * Pure helpers for the Pinterest resolver + sniffer. Nothing here touches the DOM,
 * `chrome.*`, or the network, so it is unit-testable and safe to run in the page
 * realm (the MAIN-world sniffer imports it too).
 *
 * Pinterest ships each pin's full media graph — the size map `images` (down to
 * `orig`) and, for video pins, `videos.video_list` (progressive mp4 + HLS master)
 * — inside its own `/resource/<Name>/get/` JSON responses (feeds) and the SSR
 * `initialReduxState` blob. We read the URLs it already served (never forge one).
 * Keying is by the numeric pin `id`, inherited by carousel slides.
 */

export interface PinterestMediaEntry {
  pinId: string;
  kind: 'image' | 'video';
  url: string;
  ext: string;
  width?: number;
  height?: number;
  poster?: string;
  /** A pin we only have a cover for (no usable video URL yet). */
  pending?: boolean;
}

const isPinimgHost = (h: string): boolean => h === 'pinimg.com' || h.endsWith('.pinimg.com');

/** A URL from page JSON is untrusted — return it only if it is an https pinimg
 *  CDN URL (i./v./v1.pinimg.com), else null. Used before every candidate. */
export function pinPinimgUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && isPinimgHost(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** The numeric pin id from a /pin/<id> url or slug (…--<id>), or null. The id run
 *  may be terminated by a slash, a query (`?`), a hash (`#`), or end-of-string —
 *  a tracking-decorated anchor or pushState url can append `?…` with no trailing
 *  slash. Single source of truth: pinterest.ts's resolver reuses this. */
export function pinIdFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  return url.match(/\/pin\/(?:[^/]*--)?(\d+)(?:[/?#]|$)/)?.[1] ?? null;
}

export const PIN_EXT = /^(?:jpe?g|png|webp|gif|avif|mp4|m3u8|mov|webm|m4v)$/i;

function extFromUrl(url: string, fallback: string): string {
  try {
    const ext = new URL(url).pathname.match(/\.(\w+)$/)?.[1]?.toLowerCase();
    return ext && PIN_EXT.test(ext) ? ext : fallback;
  } catch {
    return fallback;
  }
}

interface Sized { url?: unknown; width?: unknown; height?: unknown }

/** Best image from an `images` size map: prefer `orig`, else the largest width. */
function bestImage(images: unknown): { url: string; width: number; height: number } | null {
  if (!images || typeof images !== 'object') return null;
  const map = images as Record<string, unknown>;
  const pick = (v: unknown): { url: string; width: number; height: number } | null => {
    const o = v as Sized | undefined;
    const url = pinPinimgUrl(o?.url);
    return url ? { url, width: Number(o?.width) || 0, height: Number(o?.height) || 0 } : null;
  };
  const orig = pick(map.orig);
  if (orig) return orig;
  let best: { url: string; width: number; height: number } | null = null;
  for (const k in map) {
    const c = pick(map[k]);
    if (c && (!best || c.width > best.width)) best = c;
  }
  return best;
}

/** Video URL from `videos.video_list`. Progressive mp4 (V_720P) preferred; else
 *  the HLS master (V_HLSV4 ?? V_HLSV3_MOBILE), returned with `ext: 'm3u8'` — a
 *  plain URL+ext pair, not the `{ hls: true }` shape network.ts's async tier
 *  uses. The manifest → capture-engine routing (setting `hlsManifest` so it is
 *  never handed to chrome.downloads directly) happens downstream in
 *  `pushCandidate` (collect.ts), not here. */
function bestVideo(videos: unknown): { url: string; ext: string } | null {
  const list = (videos as { video_list?: unknown } | undefined)?.video_list;
  if (!list || typeof list !== 'object') return null;
  const l = list as Record<string, { url?: unknown } | undefined>;
  const mp4 = pinPinimgUrl(l.V_720P?.url);
  if (mp4) return { url: mp4, ext: 'mp4' };
  const hls = pinPinimgUrl(l.V_HLSV4?.url) ?? pinPinimgUrl(l.V_HLSV3_MOBILE?.url);
  return hls ? { url: hls, ext: 'm3u8' } : null;
}

/**
 * Deep-walk a Pinterest resource/SSR JSON object and return one
 * `PinterestMediaEntry` per pin media (carousel slides flattened, all under the
 * parent pin id). Pure and defensive: never throws, bounded step count, first url
 * per media wins. A carousel container emits nothing itself (its cover would
 * duplicate slide 1) — its slots emit, inheriting the parent id. Non-pin
 * containers (a `type:"board"`/`"user"` object) are skipped so a board cover is
 * not mislabelled as a pin.
 */
export function extractPinterestMedia(root: unknown): PinterestMediaEntry[] {
  const out: PinterestMediaEntry[] = [];
  const seenUrls = new Set<string>();
  const seen = new Set<object>();
  const steps = { n: 0 };

  const emit = (obj: Record<string, unknown>, pinId: string): void => {
    if (obj.videos && obj.protected_delivery !== true) {
      const v = bestVideo(obj.videos);
      if (v && !seenUrls.has(v.url)) {
        seenUrls.add(v.url);
        const poster = bestImage(obj.images);
        const entry: PinterestMediaEntry = { pinId, kind: 'video', url: v.url, ext: v.ext };
        if (poster) entry.poster = poster.url;
        out.push(entry);
        return;
      }
    }
    const img = bestImage(obj.images);
    if (img && !seenUrls.has(img.url)) {
      seenUrls.add(img.url);
      out.push({ pinId, kind: 'image', url: img.url, ext: extFromUrl(img.url, 'jpg'), width: img.width, height: img.height });
    }
  };

  const walk = (node: unknown, inheritedId: string | undefined): void => {
    if (steps.n++ > 400000 || !node || typeof node !== 'object' || seen.has(node as object)) return;
    seen.add(node as object);
    const obj = node as Record<string, unknown>;

    // Pinterest pin ids are long numeric strings; 6 is a loose floor rejecting short board/user/other ids.
    const id = typeof obj.id === 'string' && /^\d{6,}$/.test(obj.id) ? obj.id : inheritedId;
    // Only pin-like objects emit: an explicit non-pin type (board/user/…) is skipped.
    const type = typeof obj.type === 'string' ? obj.type : null;
    const isPinLike = type === null || type === 'pin' || type === 'story';
    const hasCarousel = Array.isArray((obj.carousel_data as { carousel_slots?: unknown } | undefined)?.carousel_slots);

    if (id && isPinLike && !hasCarousel && (obj.images || obj.videos)) emit(obj, id);

    for (const k in obj) {
      const val = obj[k];
      if (val && typeof val === 'object') walk(val, id);
    }
  };

  walk(root, undefined);
  return out;
}
