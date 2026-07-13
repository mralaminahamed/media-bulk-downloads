import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '../types';

// v.redd.it path: /<id>/<file> — the id is the first segment (the same id the
// public HLS/DASH masters are served under).
const VREDD_ID = /^\/([a-z0-9]+)\//i;

/**
 * Reddit. Owns the reddit CDN hosts so it runs before the generic resolver:
 *  - `preview.redd.it/<file>` (a signed, resized rendition) → the unsigned original
 *    `i.redd.it/<file>` (same filename, host swap, query dropped);
 *  - `i.redd.it/<file>` → the original with any tracking query stripped;
 *  - `v.redd.it/<id>/…` (a video — the `<id>/CMAF_720.mp4` fallback is video-only and
 *    silent) → a pending video resolved to the signature-free HLS master
 *    `v.redd.it/<id>/HLSPlaylist.m3u8`, whose separate audio rendition the HLS engine
 *    muxes back in.
 * `external-preview.redd.it` (proxied external images with a query-covering signature
 * and no `i.redd.it` original) is intentionally left to the generic resolver.
 */
export const redditResolver: Resolver = {
  id: 'reddit',
  hosts: ['redd.it'],
  match: (u) => u.hostname === 'i.redd.it' || u.hostname === 'preview.redd.it' || u.hostname === 'v.redd.it',
  resolve: (u): MediaCandidate[] => {
    if (u.hostname === 'v.redd.it') {
      const id = u.pathname.match(VREDD_ID)?.[1];
      if (!id) return [];
      return [{
        url: u.href,
        kind: 'video',
        unresolvedVideo: true,
        resolveHint: { platform: 'reddit', id },
      }];
    }

    // preview.redd.it → i.redd.it original; i.redd.it → itself with the query dropped.
    const out = new URL(u.href);
    out.hostname = 'i.redd.it';
    out.search = '';
    const c: MediaCandidate = { url: out.href, kind: 'image' };
    if (out.href !== u.href) c.thumbnailSrc = u.href;
    const ext = imageExtFromUrl(out.href);
    if (ext) c.ext = ext;
    return [c];
  },
};
