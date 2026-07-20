import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

function isImgchestHost(host: string): boolean {
  return host === 'imgchest.com' || host.endsWith('.imgchest.com');
}

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;
const FILE_RE = /https:\/\/cdn\.imgchest\.com\/files\/[A-Za-z0-9]+\.[a-z0-9]{1,5}/gi;

/** The post id from an Image Chest post URL (`/p/<id>`), or null (not a post page). */
export function imgchestPostId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isImgchestHost(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/^\/p\/([A-Za-z0-9]+)(?:[/?#]|$)/)?.[1] ?? null;
}

/**
 * Extract an Image Chest post's files from its page markup (synchronous,
 * network-free). Every file's original CDN URL (cdn.imgchest.com/files/<id>.<ext>)
 * is serialized into the Inertia `data-page` payload, so the originals are already
 * in the markup — nothing is fetched. A private/empty post ships no file URLs →
 * `[]` (fails closed). Ordered by first appearance, deduped by URL.
 */
export function imgchestMediaFromHtml(html: string, postId: string): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  const re = new RegExp(FILE_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[0];
    if (seen.has(url)) continue;
    const idx = out.length;
    const img = imageExtFromUrl(url);
    if (img) {
      seen.add(url);
      out.push({ url, kind: img === 'gif' ? 'gif' : 'image', ext: img, mediaKey: `imgchest ${postId} ${idx}` });
      continue;
    }
    if (VIDEO_RE.test(url)) {
      seen.add(url);
      out.push({ url, kind: 'video', ext: extensionFromUrl(url) ?? 'mp4', mediaKey: `imgchest ${postId} ${idx}` });
    }
  }
  return out;
}

/**
 * Reads the current Image Chest post page's files from the DOM (network-free), for
 * `collectMedia`. No-ops off an Image Chest post page.
 */
export function imgchestPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const postId = imgchestPostId(src);
  if (!postId || typeof document === 'undefined') return [];
  return imgchestMediaFromHtml(document.documentElement.innerHTML, postId);
}
