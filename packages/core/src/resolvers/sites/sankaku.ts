import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

const SANKAKU_HOST = /(?:^|\.)sankakucomplex\.com$/i;
const SANKAKU_IMG =
  /\/data\/(?:preview\/|sample\/)?(?:[0-9a-f]{2}\/)*([0-9a-f]{32})\.(avif|jpe?g|png|gif|webp)$/i;
// Grid thumbnails are the preview tier; only these need an authed upgrade to the
// original (the original tier already IS the original).
const SANKAKU_PREVIEW = /\/data\/preview\//i;
// A Sankaku post id in a grid tile's link: short base64url after /posts/, must be
// followed by a query string, hash, or end of string to ensure it's not malformed.
const SANKAKU_POST_ID = /\/posts\/([A-Za-z0-9_-]+)(?:[?#]|$)/;
const VALID_POST_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Sankaku (Tier-1 passive + the Tier-2 seam). Tier-1: claims Sankaku media URLs
 * before the generic fallback and stamps a stable md5 mediaKey (the signed URL is
 * kept intact — a preview→original rewrite would 404). Tier-2: for a grid PREVIEW
 * tile whose DOM ancestor links to /posts/<id>, it additionally attaches a
 * resolveHint so the opt-in authed resolve (network.ts) can fetch the original.
 * Attaching the hint is inert on its own — the authed fetch runs only behind the
 * explicit opt-in marker (resolveOriginalsBatch), never on passive collection.
 */
export const sankakuResolver: Resolver = {
  id: 'sankaku',
  hosts: ['sankakucomplex.com'],
  match: (u) => SANKAKU_HOST.test(u.hostname) && SANKAKU_IMG.test(u.pathname),
  resolve: (u, ctx?: ResolveContext): MediaCandidate[] => {
    const found = u.pathname.match(SANKAKU_IMG);
    if (!found) return [];
    const c: MediaCandidate = {
      url: u.href,
      kind: 'image',
      ext: found[2].toLowerCase(),
      mediaKey: `sankaku ${found[1].toLowerCase()}`,
    };
    if (SANKAKU_PREVIEW.test(u.pathname) && ctx?.el) {
      const href = ctx.el.closest('a[href*="/posts/"]')?.getAttribute('href') || '';
      const id = href.match(SANKAKU_POST_ID)?.[1];
      if (id && VALID_POST_ID.test(id)) c.resolveHint = { platform: 'sankaku', id };
    }
    return [c];
  },
};
