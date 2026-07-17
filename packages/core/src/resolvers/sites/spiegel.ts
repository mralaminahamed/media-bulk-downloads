import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { parseSrcset } from '@mbd/core/collection/imageUrl';

// Der Spiegel image CDN. Rendition filename shape:
//   /images/<uuid>_w<width>_r<ratio>_fpx<x>_fpy<y>.<ext>
// <uuid> is a unique image id shared by every width/crop/format rendition of one
// photo; <width> is the pixel width; <ratio> is width/height.
const SPIEGEL_HOST = 'cdn.prod.www.spiegel.de';
const SPIEGEL_IMG = /^\/images\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})_w(\d+)_r([\d.]+)_/i;

interface SpiegelImg {
  url: string;
  uuid: string;
  width: number;
  ratio: number;
}

/** Parse a Der Spiegel rendition URL (host-pinned, https), or null. */
function parseSpiegel(raw: string | null | undefined): SpiegelImg | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== SPIEGEL_HOST) return null;
  const m = u.pathname.match(SPIEGEL_IMG);
  if (!m) return null;
  return { url: u.href, uuid: m[1].toLowerCase(), width: Number(m[2]), ratio: Number(m[3]) };
}

/**
 * Der Spiegel (Tier-2 DOM read). Der Spiegel serves each photo under one <uuid> at
 * many widths/crops as SEPARATE filenames; the displayed <img> `src` is a small
 * width and the larger ones live in `srcset` (and the <picture>'s <source>s). The
 * collector dedups by canonical key first-seen, and the small `src` is collected
 * first — so a passive width tag alone would keep the small one. Instead, for EVERY
 * collected variant this resolver reads the element's srcset and returns the WIDEST
 * rendition of the SAME <uuid> the page offers, so all variants converge on one row
 * = the largest. It only ever returns a URL the page itself listed (never a
 * fabricated width, which would 404 — Der Spiegel's max width is per-image bounded),
 * and never downgrades. A <uuid> mediaKey folds the renditions across scans/tabs.
 */
export const spiegelResolver: Resolver = {
  id: 'spiegel',
  hosts: ['spiegel.de'],
  match: (u) => u.hostname === SPIEGEL_HOST && SPIEGEL_IMG.test(u.pathname),
  resolve: (u, ctx: ResolveContext): MediaCandidate[] => {
    const input = parseSpiegel(u.href);
    if (!input) return [];

    // Widen to the largest same-<uuid> rendition offered by this element's srcset
    // (and, for a <picture>, its sibling <source>s). Only same-uuid, only wider.
    let best = input;
    const el = ctx.el;
    if (el && typeof el.getAttribute === 'function') {
      const picture = typeof el.closest === 'function' ? el.closest('picture') : null;
      const els: Element[] = picture ? Array.from(picture.querySelectorAll('source, img')) : [el];
      for (const e of els) {
        for (const attr of ['srcset', 'data-srcset', 'data-lazy-srcset']) {
          const ss = e.getAttribute(attr);
          if (!ss) continue;
          // Take the widest SAME-uuid candidate (an <img> srcset is one photo, but a
          // <picture>'s <source>s can mix crops; never adopt a neighbour photo's URL).
          for (const cand of parseSrcset(ss)) {
            const p = parseSpiegel(cand);
            if (p && p.uuid === input.uuid && p.width > best.width) best = p;
          }
        }
      }
    }

    const ext = imageExtFromUrl(best.url);
    const c: MediaCandidate = {
      url: best.url,
      kind: 'image',
      width: best.width,
      mediaKey: `spiegel ${input.uuid}`,
    };
    if (best.url !== u.href) c.thumbnailSrc = u.href;
    const height = best.ratio > 0 ? Math.round(best.width / best.ratio) : 0;
    if (height > 0) c.height = height;
    if (ext) c.ext = ext;
    return [c];
  },
};
