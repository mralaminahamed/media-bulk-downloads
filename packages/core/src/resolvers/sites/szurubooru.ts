import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

// szurubooru is a Vue-SPA booru; a post page (`/post/<id>`) has no server-rendered
// image, but once hydrated the post's original is a distinctive same-host URL:
// `<host>/data/posts/<id>_<hash>.<ext>` (thumbnails live under `/data/generated-thumbnails/`).
// Read that straight from the rendered markup — no API, keyless.
const SZURU_HOST_RE = /^(?:www\.)?(?:snootbooru\.com|booru\.bcbnsfw\.space)$/i;

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

export interface SzurubooruRef {
  host: string;
  id: string;
}

/** Parse a szurubooru post URL (`/post/<id>`), or null (not a post page on a known host). */
export function szurubooruRef(raw: string | URL): SzurubooruRef | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!SZURU_HOST_RE.test(host)) return null;
  const m = u.pathname.match(/^\/post\/(\d+)(?:[/?#]|$)/);
  if (!m) return null;
  return { host, id: m[1] };
}

/**
 * Extract a szurubooru post's original from its (hydrated) page markup
 * (network-free). The original is the first `/data/posts/<file>` URL on the post's
 * own host — resolved from a relative or absolute reference and classified by ext
 * (image/gif/video). The `/data/generated-thumbnails/` previews are ignored. A page
 * that hasn't rendered its content (or a removed post) yields `[]` (fails closed).
 */
export function szurubooruMediaFromHtml(html: string, ref: SzurubooruRef): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  // Optional `https://<host>` prefix + the distinctive `/data/posts/<file>.<ext>` path.
  const re = /(?:https?:\/\/[a-z0-9.-]+)?\/data\/posts\/[A-Za-z0-9_.-]+\.[a-z0-9]{1,5}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let abs: URL;
    try {
      abs = new URL(m[0], `https://${ref.host}`);
    } catch {
      continue;
    }
    if (abs.protocol !== 'https:' || abs.hostname.toLowerCase() !== ref.host) continue;
    const img = imageExtFromUrl(abs.href);
    if (img) return [{ url: abs.href, kind: img === 'gif' ? 'gif' : 'image', ext: img, mediaKey: `szuru ${ref.host} ${ref.id}` }];
    if (VIDEO_RE.test(abs.href)) return [{ url: abs.href, kind: 'video', ext: extensionFromUrl(abs.href) ?? 'mp4', mediaKey: `szuru ${ref.host} ${ref.id}` }];
  }
  return [];
}

/**
 * Reads the current szurubooru post page's original from the DOM (network-free), for
 * `collectMedia`. No-ops off a szurubooru post page.
 */
export function szurubooruPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const ref = szurubooruRef(src);
  if (!ref || typeof document === 'undefined') return [];
  return szurubooruMediaFromHtml(document.documentElement.innerHTML, ref);
}
