import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

function isPatreonHost(host: string): boolean {
  return host === 'patreon.com' || host.endsWith('.patreon.com');
}

/** The numeric post id from a Patreon post URL, or null (not a Patreon post page). */
export function patreonPostId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isPatreonHost(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/\/posts\/(?:[^/]*?-)?(\d+)(?:[/?#]|$)/)?.[1] ?? null;
}

function mediaRe(postId: string): RegExp {
  return new RegExp(
    `https://[a-z0-9]+\\.patreonusercontent\\.com/\\d+/patreon-media/p/post/${postId}/([0-9a-f]+)/([^/?"'\\s]+)/([^/?"'\\s]+)(\\?[^"'\\s<>]*)?`,
    'gi',
  );
}

/**
 * Rank a Patreon transform segment (base64-encoded JSON of the render options) so
 * the same image's largest rendition wins. The un-resized original carries
 * `{"a":1,…}` and ranks highest; otherwise the max of the requested width/height;
 * otherwise 0 (unknown/undecodable). The token in the URL query is bound to the
 * exact rendition, so the original can't be *built* by rewriting the transform — it
 * must be *selected* from the renditions the page already shipped (and its signed
 * query kept intact). base64 padding may arrive percent-encoded (`%3D`).
 */
function transformRank(seg: string): number {
  try {
    const json = JSON.parse(atob(decodeURIComponent(seg))) as { a?: unknown; w?: unknown; h?: unknown };
    if (json && typeof json.a === 'number') return Number.MAX_SAFE_INTEGER;
    return Math.max(Number(json?.w) || 0, Number(json?.h) || 0);
  } catch {
    return 0;
  }
}

/**
 * Extract a Patreon post's images from its page markup. Every rendition of every
 * post image (`…/patreon-media/p/post/<postId>/<hash>/<transform>/<file>`) is
 * present in the hydrated markup at multiple sizes; they are grouped per image
 * (same `<hash>`/`<file>`) and the largest rendition per group is kept — the
 * original (`{"a":1,…}`) when the page shipped it, else the widest — with its
 * signed query left intact (the token is rendition-bound; free-ride, don't
 * rewrite). Scoped to THIS post's id so campaign art / recommended-post media
 * elsewhere on the page can't leak in. A public post's images are shipped; a
 * paid/locked post the viewer can't access ships none → `[]` (fails closed — no
 * circumvention). Only images/GIFs are surfaced here (video/audio/file
 * attachments are a follow-up). Each image is one candidate keyed by its hash.
 */
export function patreonImagesFromHtml(html: string, postId: string): MediaCandidate[] {
  if (!/^\d+$/.test(postId) || typeof html !== 'string') return [];
  const best = new Map<string, { rank: number; url: string; ext: string }>();
  const re = mediaRe(postId);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [url, mediaHash, transform, file] = m;
    const ext = imageExtFromUrl(file);
    if (!ext) continue;
    const key = `${mediaHash}/${file}`;
    const rank = transformRank(transform);
    const prev = best.get(key);
    if (!prev || rank > prev.rank) best.set(key, { rank, url, ext });
  }
  const out: MediaCandidate[] = [];
  for (const [key, v] of best) {
    out.push({ url: v.url, kind: v.ext === 'gif' ? 'gif' : 'image', ext: v.ext, mediaKey: `patreon ${postId} ${key}` });
  }
  return out;
}

/**
 * Reads the current Patreon post page's images from the DOM (synchronous,
 * network-free), for `collectMedia`. No-ops off a Patreon post page.
 */
export function patreonPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const postId = patreonPostId(src);
  if (!postId || typeof document === 'undefined') return [];
  return patreonImagesFromHtml(document.documentElement.innerHTML, postId);
}
