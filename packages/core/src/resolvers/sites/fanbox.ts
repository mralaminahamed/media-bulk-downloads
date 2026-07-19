import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

// A Pixiv Fanbox post page: `<creator>.fanbox.cc/posts/<id>` or the canonical
// `www.fanbox.cc/@<creator>/posts/<id>`.
function isFanboxHost(host: string): boolean {
  return host === 'fanbox.cc' || host.endsWith('.fanbox.cc');
}

/** The numeric post id from a Fanbox post URL, or null (not a Fanbox post page). */
export function fanboxPostId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isFanboxHost(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/\/posts\/(\d+)(?:[/?#]|$)/)?.[1] ?? null;
}

// A post's full-resolution originals live on downloads.fanbox.cc under the post's
// own id: /images/post/<postId>/<key>.<ext>. Scoping the scan to <postId> keeps a
// related-post preview elsewhere on the page from leaking in.
function originalRe(postId: string): RegExp {
  return new RegExp(`https://downloads\\.fanbox\\.cc/images/post/${postId}/[A-Za-z0-9_-]+\\.(?:jpe?g|png|gif|webp)`, 'gi');
}

/**
 * Extract a Fanbox post's original images from its page markup. The rendered post
 * carries every original URL (`downloads.fanbox.cc/images/post/<postId>/<key>.<ext>`)
 * — the visible <img> tags are lazy/icon-only, but the originals are present in the
 * hydrated page — so they are scraped by pattern, scoped to THIS post's id, and
 * deduped. A free post is public; a paid/restricted post the viewer can't access
 * renders no originals, so this returns `[]` (fails closed — no circumvention).
 * downloads.fanbox.cc is hotlink-protected, so the actual download relies on the
 * #197 Referer opt-in (the fanbox page URL becomes the injected Referer), the same
 * as pximg/RedGifs. Each image is one candidate keyed by its own <key>.
 */
export function fanboxImagesFromHtml(html: string, postId: string): MediaCandidate[] {
  if (!/^\d+$/.test(postId) || typeof html !== 'string') return [];
  const seen = new Set<string>();
  const out: MediaCandidate[] = [];
  for (const url of html.match(originalRe(postId)) ?? []) {
    if (seen.has(url)) continue;
    seen.add(url);
    const key = url.match(/\/([A-Za-z0-9_-]+)\.[a-z0-9]+$/i)?.[1] ?? url;
    const ext = imageExtFromUrl(url);
    const c: MediaCandidate = { url, kind: ext === 'gif' ? 'gif' : 'image', mediaKey: `fanbox ${key}` };
    if (ext) c.ext = ext;
    out.push(c);
  }
  return out;
}

/**
 * Reads the current Fanbox post page's originals from the DOM (synchronous,
 * network-free), for `collectMedia`. No-ops off a Fanbox post page.
 */
export function fanboxPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const postId = fanboxPostId(src);
  if (!postId || typeof document === 'undefined') return [];
  return fanboxImagesFromHtml(document.documentElement.innerHTML, postId);
}
