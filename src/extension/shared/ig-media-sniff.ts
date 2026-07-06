/**
 * Pure helpers for the Instagram resolver + sniffer. Nothing here touches the DOM,
 * `chrome.*`, or the network, so it is unit-testable and safe to run in the page
 * realm (the MAIN-world sniffer imports it too).
 *
 * Strategy: Instagram ships each post's full media graph — the largest image
 * `candidates` and the real progressive-mp4 `video_versions` — inside its own
 * page JSON (Polaris hydration) and the GraphQL/api responses it fetches on
 * scroll. Those URLs are already signed by Instagram; we read the largest one it
 * served rather than rewriting a signed thumbnail (which returns 403). Keying is
 * by the post shortcode (`code`), which sits on the post object and is inherited
 * by its carousel children.
 */

/** One resolved media, keyed to its post shortcode. Carousel slides share a code. */
export interface IgMediaEntry {
  code: string;
  kind: 'image' | 'video';
  url: string;
  ext: string;
  width?: number;
  height?: number;
  poster?: string;
  /** A clip we only have the cover for (reels-grid feed) — no mp4 URL yet. `url`
   *  is the cover; it resolves to a real video once that reel's own response
   *  (carrying `video_versions`) is seen. */
  pending?: boolean;
}

const isIgHost = (h: string): boolean =>
  h === 'cdninstagram.com' || h.endsWith('.cdninstagram.com') || h === 'fbcdn.net' || h.endsWith('.fbcdn.net');

/**
 * A URL from page JSON is untrusted — return it only if it is an https
 * Instagram/Facebook CDN URL, else null. Used before every candidate we surface.
 */
export function pinIgUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && isIgHost(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** The shortcode from an IG post/reel/tv URL or path, or null (e.g. a `/user/` link). */
export function shortcodeFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  return url.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

/** File extension from the CDN path (not the `stp` transform — `jpegr` is HDR, not an ext). */
export function extFromIgUrl(url: string): string {
  try {
    return new URL(url).pathname.match(/\.(\w+)$/)?.[1]?.toLowerCase() ?? 'jpg';
  } catch {
    return 'jpg';
  }
}

interface Sized {
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

function bestSized(list: unknown): { url: string; width: number; height: number } | null {
  if (!Array.isArray(list)) return null;
  let best: { url: string; width: number; height: number } | null = null;
  for (const c of list as Sized[]) {
    const url = pinIgUrl(c?.url);
    if (!url) continue;
    const width = Number(c.width) || 0;
    const height = Number(c.height) || 0;
    if (!best || width > best.width) best = { url, width, height };
  }
  return best;
}

/** Largest-width image candidate (IG-pinned), or null. Order-independent. */
export function bestIgImage(candidates: unknown): { url: string; width: number; height: number } | null {
  return bestSized(candidates);
}

/** Highest-width progressive-mp4 URL (IG-pinned), or null. */
export function bestIgVideo(versions: unknown): string | null {
  return bestSized(versions)?.url ?? null;
}

function emitLeaf(node: Record<string, unknown>, code: string, out: IgMediaEntry[], seenUrls: Set<string>): void {
  if (node.video_versions) {
    const best = bestSized(node.video_versions);
    if (!best || seenUrls.has(best.url)) return;
    seenUrls.add(best.url);
    const poster = bestIgImage((node.image_versions2 as { candidates?: unknown } | undefined)?.candidates);
    const entry: IgMediaEntry = { code, kind: 'video', url: best.url, ext: 'mp4', width: best.width, height: best.height };
    if (poster) entry.poster = poster.url;
    out.push(entry);
    return;
  }
  if (node.image_versions2) {
    const img = bestIgImage((node.image_versions2 as { candidates?: unknown }).candidates);
    if (!img || seenUrls.has(img.url)) return;
    seenUrls.add(img.url);
    // A clip/reel (media_type 2) that carries only a cover — the reels-grid feed
    // ships no `video_versions`, so surface it as a pending video (poster = cover)
    // that resolves once the reel's own response is seen. Everything else is a
    // still image.
    if (Number(node.media_type) === 2) {
      out.push({ code, kind: 'video', url: img.url, ext: 'mp4', poster: img.url, pending: true, width: img.width, height: img.height });
    } else {
      out.push({ code, kind: 'image', url: img.url, ext: extFromIgUrl(img.url), width: img.width, height: img.height });
    }
  }
}

/**
 * Deep-walk an IG page/API JSON object and return one `IgMediaEntry` per media
 * (carousels flattened to one entry per slide, all under the parent shortcode).
 * Pure and defensive: never throws, bounded step count, first url per media wins.
 * A media object is `{ media_type, image_versions2 | video_versions |
 * carousel_media }`; a carousel container emits nothing itself (its cover would
 * duplicate slide 1) — its children emit, inheriting the parent `code`.
 */
export function extractIgMedia(root: unknown): IgMediaEntry[] {
  const out: IgMediaEntry[] = [];
  const seenUrls = new Set<string>();
  const seen = new Set<object>();
  const steps = { n: 0 };

  const walk = (node: unknown, inheritedCode: string | undefined): void => {
    if (steps.n++ > 400000 || !node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? obj.code : inheritedCode;

    if (typeof obj.media_type !== 'undefined') {
      if (!Array.isArray(obj.carousel_media)) {
        if (code) emitLeaf(obj, code, out, seenUrls);
      }
      // A carousel container emits nothing; its children (walked below) do.
    }

    for (const k in obj) {
      const val = obj[k];
      if (val && typeof val === 'object') walk(val, code);
    }
  };

  walk(root, undefined);
  return out;
}

/**
 * Pull IG media from the `<script type="application/json">` blocks in a page's
 * raw HTML string. The background worker has no DOM, so it fetches a reel/post
 * page and mines its embedded hydration this way. Pure; never throws; bounded.
 */
export function igMediaFromHtml(html: unknown): IgMediaEntry[] {
  if (typeof html !== 'string' || html.indexOf('video_versions') === -1) return [];
  const out: IgMediaEntry[] = [];
  const re = /<script\b[^>]*\btype="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(html)) !== null && guard++ < 500) {
    const text = m[1];
    if (!text || text.indexOf('video_versions') === -1) continue;
    try {
      out.push(...extractIgMedia(JSON.parse(text)));
    } catch {
      /* not JSON / not ours — skip */
    }
  }
  return out;
}
