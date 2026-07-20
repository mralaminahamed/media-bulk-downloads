import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

const KEMONO_HOST_RE = /^(?:www\.)?(?:kemono|coomer)\.(?:cr|su|st|party)$/i;

function isKemonoHost(host: string): boolean {
  return KEMONO_HOST_RE.test(host);
}

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

export interface KemonoPostRef {
  host: string;
  service: string;
  creatorId: string;
  postId: string;
}

/** Parse a Kemono/Coomer post URL, or null (not a post page on a known host). */
export function kemonoPostRef(raw: string | URL): KemonoPostRef | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!isKemonoHost(host)) return null;
  const m = u.pathname.match(/^\/([a-z0-9_.-]+)\/user\/([^/]+)\/post\/([^/?#]+)/i);
  if (!m) return null;
  return { host, service: m[1], creatorId: m[2], postId: m[3] };
}

function classifyDataUrl(url: string): { kind: 'image' | 'video' | 'gif'; ext: string } | null {
  const pathImg = imageExtFromUrl(url);
  if (pathImg) return { kind: pathImg === 'gif' ? 'gif' : 'image', ext: pathImg };
  if (VIDEO_RE.test(url)) return { kind: 'video', ext: extensionFromUrl(url) ?? 'mp4' };
  const f = /[?&]f=([^&]+)/.exec(url)?.[1];
  if (f) {
    let name = f;
    try { name = decodeURIComponent(f); } catch { /* keep raw */ }
    const nameImg = imageExtFromUrl(name);
    if (nameImg) return { kind: nameImg === 'gif' ? 'gif' : 'image', ext: nameImg };
    if (VIDEO_RE.test(name)) return { kind: 'video', ext: extensionFromUrl(name) ?? 'mp4' };
  }
  return null;
}

/**
 * Extract a Kemono/Coomer post's files from its page markup (synchronous,
 * network-free). The post's files and attachments are `<a href>` / `<img src>`
 * pointing at `<host>/data/<hash>.<ext>` on the post's own host — the originals,
 * already in the markup. The `/thumbnail/` preview server (and the "more from this
 * creator" strip that uses it) is skipped, so only this post's originals surface;
 * off-host URLs are dropped. A post the viewer can't access renders no `/data/`
 * links → `[]` (fails closed). Deduped by path (the `?f=` filename hint is kept for
 * the download name — it is not a token).
 */
export function kemonoMediaFromHtml(html: string, ref: KemonoPostRef): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  const re = /(?:href|src)="(https?:\/\/[^"]*\/data\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (/\/thumbnail\//i.test(url)) continue;
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!isKemonoHost(host)) continue;
    const key = url.split(/[?#]/)[0];
    if (seen.has(key)) continue;
    const cls = classifyDataUrl(url);
    if (!cls) continue;
    seen.add(key);
    out.push({
      url,
      kind: cls.kind,
      ext: cls.ext,
      mediaKey: `kemono ${ref.postId} ${key.split('/').pop() ?? ''}`,
    });
  }
  return out;
}

/**
 * Reads the current Kemono/Coomer post page's files from the DOM (network-free),
 * for `collectMedia`. No-ops off a Kemono/Coomer post page.
 */
export function kemonoPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const ref = kemonoPostRef(src);
  if (!ref || typeof document === 'undefined') return [];
  return kemonoMediaFromHtml(document.documentElement.innerHTML, ref);
}
