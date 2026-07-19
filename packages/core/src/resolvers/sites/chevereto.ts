import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

// Chevereto is image-host software running on a rotating set of instances. An image
// viewer page (`/img/<id>`, `/image/<id>`, `/i/<id>`) exposes the full-resolution
// original in its `og:image` meta tag. The known instances (from gallery-dl):
//   jpgfish  — jpg/jpeg[N].{cr,su,pet,fish[ing],church}
//   imglike  — imglike.com
//   putmega  — putmega.com / putme.ga
export const CHEVERETO_HOST_RE =
  /^(?:www\.)?(?:jpe?g\d?\.(?:cr|su|pet|fish(?:ing)?|church)|imglike\.com|putme(?:ga\.com|\.ga))$/i;

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

export interface CheveretoImageRef {
  id: string;
  host: string;
}

/** Parse a Chevereto image viewer URL, or null (not an image page on a known instance). */
export function cheveretoImageRef(raw: string | URL): CheveretoImageRef | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!CHEVERETO_HOST_RE.test(host)) return null;
  const m = u.pathname.match(/^\/(?:im(?:g|age)|i)\/([^/?#]+)/i);
  if (!m) return null;
  return { id: m[1], host };
}

// The og:image content, matched with the property either before or after content.
function ogImage(html: string): string | null {
  return (
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i.exec(html)?.[1] ??
    null
  );
}

/**
 * Extract a Chevereto image page's original from its markup (network-free). The
 * original is the `og:image` URL — but only when it is a plaintext `https` media
 * URL: some jpgfish instances ship an encrypted/placeholder `og:image` (not a real
 * URL), and those are skipped rather than decrypted (fails closed, no
 * circumvention). One candidate per page.
 */
export function cheveretoMediaFromHtml(html: string, ref: CheveretoImageRef): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const og = ogImage(html);
  // Must be a plaintext https media URL — an encrypted blob, a relative path, or a
  // `loading.svg` placeholder is not the original.
  if (!og || !/^https:\/\//i.test(og) || /loading\.svg(?:$|[?#])/i.test(og)) return [];
  const ext = imageExtFromUrl(og);
  const isVideo = VIDEO_RE.test(og);
  if (!ext && !isVideo) return [];
  return [
    {
      url: og,
      kind: isVideo ? 'video' : ext === 'gif' ? 'gif' : 'image',
      ext: ext ?? 'mp4',
      mediaKey: `chevereto ${ref.host} ${ref.id}`,
    },
  ];
}

/**
 * Reads the current Chevereto image page's original from the DOM (network-free),
 * for `collectMedia`. No-ops off a Chevereto image page.
 */
export function cheveretoPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const ref = cheveretoImageRef(src);
  if (!ref || typeof document === 'undefined') return [];
  return cheveretoMediaFromHtml(document.documentElement.innerHTML, ref);
}
