import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { kindFromExt, pageHost, pinnedDomUrl } from '@mbd/core/resolvers/sites/pageOriginal';

// Gated on the PAGE host (the media lives on i.postimg.cc, a different host than
// the viewer page). Postimages is an image/GIF host — no video.
const HOSTS = new Set([
  'postimg.cc', 'www.postimg.cc',
  'postimages.org', 'www.postimages.org',
]);
// The full original is served from i.postimg.cc (same registrable domain).
const IMG_HOSTS = ['postimg.cc'];

/**
 * Postimages / postimg.cc viewer-page resolver. The displayed image *and*
 * `og:image` are a downscaled render on a **different** hash, so neither can be
 * trusted — the true original is the `#download` button's target (a distinct
 * i.postimg.cc URL, e.g. `…/9CDs7rdq/image.jpg?dl=1`). The `?dl=1` is only an
 * attachment flag; strip it for a stable inline URL. Network-free, host-pinned.
 */
export const postimagesResolver: Resolver = {
  id: 'postimages',
  match: (_u, ctx) => {
    const host = pageHost(ctx);
    return host !== null && HOSTS.has(host);
  },
  resolve: (u, ctx): MediaCandidate[] => {
    const doc = ctx.el?.ownerDocument;
    if (!doc) return [];
    const href = doc.querySelector('a#download')?.getAttribute('href');
    const raw = href ? href.replace(/\?dl=1$/, '') : null;
    const full = pinnedDomUrl(raw, IMG_HOSTS);
    if (!full || full === u.href) return []; // no download link / already the original
    const ext = extensionFromUrl(full);
    const c: MediaCandidate = { url: full, kind: kindFromExt(ext), thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    return [c];
  },
};
