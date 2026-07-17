import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { parseSrcset } from '@mbd/core/collection/imageUrl';

// Onedio image CDN. Rendition path shape:
//   /id-<hex>/rev-<n>/w-<width>[/h-<height>]/f-<fmt>/s-<sig>.<ext>
// <hex> is a per-photo id shared by every width/format rendition of one photo;
// <width>/<height> are the pixel dimensions; <sig> signs THIS exact rendition —
// so a fabricated width 404s, every offered size is separately pre-signed.
const ONEDIO_HOST = /^img-s\d+\.onedio\.com$/i;
const ONEDIO_IMG = /^\/id-([0-9a-f]+)\/rev-\d+\/w-(\d+)(?:\/h-(\d+))?\/f-[a-z0-9]+\/s-[0-9a-f]+\.[a-z0-9]+$/i;

interface OnedioImg {
  url: string;
  id: string;
  width: number;
  height: number;
}

/** Parse an Onedio rendition URL (host-pinned, https), or null. */
function parseOnedio(raw: string | null | undefined): OnedioImg | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !ONEDIO_HOST.test(u.hostname)) return null;
  const m = u.pathname.match(ONEDIO_IMG);
  if (!m) return null;
  return { url: u.href, id: m[1].toLowerCase(), width: Number(m[2]), height: m[3] ? Number(m[3]) : 0 };
}

/**
 * Onedio (Tier-2 DOM read). Onedio serves each photo under one <id> at several
 * widths (300/600/900/1200) as SEPARATE, individually SIGNED filenames listed in
 * the element's `srcset`; the displayed <img> `src` is often a narrow one. The
 * signature blocks fabricating a wider size (any unlisted width 404s), so this
 * resolver never invents a URL — for EVERY collected variant it reads the srcset
 * and returns the WIDEST rendition of the SAME <id> the page already offers. All
 * variants of one photo therefore converge on one row = the largest, so the
 * collector's first-seen canonical dedup keeps the big one instead of scattering
 * 300w/600w/900w/1200w copies. An <id> mediaKey folds the renditions across
 * scans/tabs. Never downgrades.
 */
export const onedioResolver: Resolver = {
  id: 'onedio',
  hosts: ['onedio.com'],
  match: (u) => ONEDIO_HOST.test(u.hostname) && ONEDIO_IMG.test(u.pathname),
  resolve: (u, ctx: ResolveContext): MediaCandidate[] => {
    const input = parseOnedio(u.href);
    if (!input) return [];

    // Widen to the largest same-<id> rendition offered by this element's srcset
    // (and, for a <picture>, its sibling <source>s). Only same-id, only wider.
    let best = input;
    const el = ctx.el;
    if (el && typeof el.getAttribute === 'function') {
      const picture = typeof el.closest === 'function' ? el.closest('picture') : null;
      const els: Element[] = picture ? Array.from(picture.querySelectorAll('source, img')) : [el];
      for (const e of els) {
        for (const attr of ['srcset', 'data-srcset', 'data-lazy-srcset']) {
          const ss = e.getAttribute(attr);
          if (!ss) continue;
          for (const cand of parseSrcset(ss)) {
            const p = parseOnedio(cand);
            if (p && p.id === input.id && p.width > best.width) best = p;
          }
        }
      }
    }

    const ext = imageExtFromUrl(best.url);
    const c: MediaCandidate = {
      url: best.url,
      kind: 'image',
      width: best.width,
      mediaKey: `onedio ${input.id}`,
    };
    if (best.url !== u.href) c.thumbnailSrc = u.href;
    if (best.height > 0) c.height = best.height;
    if (ext) c.ext = ext;
    return [c];
  },
};
