import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

// The full-res wallpaper is served from images.wallpaperscraft.com under a
// deterministic /image/single/<slug>_<W>x<H>.<ext> path. The page shows a small
// preview (e.g. _1280x720); the true resolutions are listed as /download/<slug>/<res>
// links. Reading the largest listed resolution and rebuilding the image URL is
// network-free — a blind resolution bump would 404 (not every wallpaper has 4K).
const IMG_HOST = 'images.wallpaperscraft.com';
const SINGLE_RE = /^\/image\/single\/(.+)_(\d+)x(\d+)\.([a-z0-9]+)$/i;
const DOWNLOAD_RE = /\/download\/([^/?#]+)\/(\d+)x(\d+)(?:[/?#]|$)/gi;

/** The largest resolution listed on the page for `slug` (as [W, H]), or null. */
function maxListedResolution(doc: Document | null | undefined, slug: string): [number, number] | null {
  const anchors = doc?.querySelectorAll?.('a[href*="/download/"]');
  if (!anchors) return null;
  let best: [number, number] | null = null;
  let bestArea = 0;
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute('href');
    if (!href) continue;
    // A single href yields at most one /download/<slug>/<res> — but reset lastIndex
    // per href since the regex is global (shared across the loop).
    DOWNLOAD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DOWNLOAD_RE.exec(href)) !== null) {
      if (m[1] !== slug) continue; // an unrelated wallpaper's download link
      const w = Number(m[2]);
      const h = Number(m[3]);
      const area = w * h;
      if (area > bestArea) { bestArea = area; best = [w, h]; }
    }
  }
  return best;
}

/**
 * Wallpaperscraft. Owns images.wallpaperscraft.com so it runs before the generic
 * resolver: a preview image (/image/single/<slug>_<W>x<H>.<ext>) is upgraded to the
 * largest resolution the page lists for that slug in its /download/<slug>/<res>
 * links, rebuilt on the same deterministic path. Returns [] (→ generic identity)
 * when the DOM has no larger resolution, so a preview is never replaced by a
 * guessed URL that could 404.
 */
export const wallpaperscraftResolver: Resolver = {
  id: 'wallpaperscraft',
  hosts: ['wallpaperscraft.com'],
  match: (u) => u.hostname === IMG_HOST && u.pathname.startsWith('/image/single/'),
  resolve: (u, ctx): MediaCandidate[] => {
    const parsed = u.pathname.match(SINGLE_RE);
    if (!parsed) return [];
    const [, slug, curW, curH, ext] = parsed;
    const max = maxListedResolution(ctx.el?.ownerDocument, slug);
    if (!max) return [];
    const [w, h] = max;
    if (w * h <= Number(curW) * Number(curH)) return []; // page lists nothing larger
    const full = `https://${IMG_HOST}/image/single/${slug}_${w}x${h}.${ext}`;
    const c: MediaCandidate = { url: full, kind: 'image', thumbnailSrc: u.href, width: w, height: h };
    const e = extensionFromUrl(full);
    if (e) c.ext = e;
    return [c];
  },
};
