import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

// Sankaku media hosts (v./s./legacy cdn.sankakucomplex.com). The SPA host
// sankaku.app and analytics a.sankakucomplex.com are not media hosts and carry no
// /data/<md5> path, so they never match.
const SANKAKU_HOST = /(?:^|\.)sankakucomplex\.com$/i;
// /data[/preview|/sample]/<shard>/<shard>/<md5>.<imgext> — the signed original or
// its preview/sample thumbnail. Image tiers only; a video post (.mp4/.webm/…) does
// not match and falls through to the generic/existing video handling.
const SANKAKU_IMG =
  /\/data\/(?:preview\/|sample\/)?(?:[0-9a-f]{2}\/)*([0-9a-f]{32})\.(avif|jpe?g|png|gif|webp)$/i;

/**
 * Sankaku (Tier-1, passive). A logged-in full-view already renders the signed
 * original <img>; this resolver just claims those media URLs before the generic
 * fallback and stamps a stable md5 mediaKey so a preview and its original fold to
 * one row across scans. It performs NO rewrite — every tier is signed with an
 * expiring token, so a preview→original path rewrite would 404 — and keeps the
 * already-signed URL intact (the token is required to fetch). It is the natural
 * seam for the opt-in authenticated Tier-2 originals (#319), which will add a
 * resolveHint here.
 */
export const sankakuResolver: Resolver = {
  id: 'sankaku',
  hosts: ['sankakucomplex.com'],
  match: (u) => SANKAKU_HOST.test(u.hostname) && SANKAKU_IMG.test(u.pathname),
  resolve: (u): MediaCandidate[] => {
    const found = u.pathname.match(SANKAKU_IMG);
    if (!found) return [];
    return [{ url: u.href, kind: 'image', ext: found[2].toLowerCase(), mediaKey: `sankaku ${found[1].toLowerCase()}` }];
  },
};
