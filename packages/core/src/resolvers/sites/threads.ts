import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { splitSrcsetCandidates } from '@mbd/core/collection/imageUrl';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

/**
 * Threads resolver. Threads (threads.com / threads.net) is Meta's Instagram-infra
 * app: its media is served from the same signed CDNs (`*.cdninstagram.com`,
 * `*.fbcdn.net`). Unlike Instagram — whose `stp` size token is signature-locked,
 * so a bigger URL must come from the page's hydration/GraphQL — a Threads profile
 * grid ships the FULL original directly in each `<img>`'s `srcset` (up to ~2610w),
 * a real fetchable URL the layout already uses.
 *
 * The generic path loses it: every srcset size-variant shares one pathname, so
 * `canonicalSrcKey` collapses them to one item and the first-seen `currentSrc`
 * (a small grid thumbnail) wins — the 2610w candidate is deduped away. This
 * resolver fixes that at the source: given the grid `<img>`, it returns that
 * element's widest srcset candidate (the original) so the collected item is the
 * full-resolution image, not the thumbnail.
 *
 * Gated to Threads pages by `ctx.pageUrl` so the Instagram/Facebook resolvers keep
 * owning the same CDN hosts on their own sites (there the resolver returns `[]`
 * and the registry falls through). Images only — and it need not handle video: a
 * MOUNTED Threads <video> carries a REAL https progressive .mp4 in its src
 * (cdninstagram), which the generic collectAv <video> path already collects
 * downloadably. Unlike Instagram reels, Threads video is NOT blob:-backed. Its
 * feed/grid is virtualized, though: only the active tile mounts a <video>; an
 * unmounted video tile exposes only its cover image, and that post's mp4 is in
 * neither the page hydration nor the feed GraphQL (verified live 2026-07-10), so
 * it is not passively reachable. See docs/BENCHMARK.md §I.
 */

const META_CDN = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i;
const THREADS_HOST = /(?:^|\.)threads\.(?:com|net)$/i;

function isThreadsPage(pageUrl?: string): boolean {
  if (!pageUrl) return false;
  try {
    return THREADS_HOST.test(new URL(pageUrl).hostname);
  } catch {
    return false;
  }
}

/** Widest `w`-descriptor candidate in a srcset, with its width (0 if undescribed). */
function widestCandidate(srcset: string): { url: string; width: number } | null {
  let best: { url: string; width: number } | null = null;
  for (const raw of splitSrcsetCandidates(srcset)) {
    const parts = raw.trim().split(/\s+/);
    const url = parts[0];
    if (!url) continue;
    const m = (parts[1] || '').match(/^(\d+)w$/);
    const width = m ? parseInt(m[1], 10) : 0;
    if (!best || width > best.width) best = { url, width };
  }
  return best;
}

export const threadsResolver: Resolver = {
  id: 'threads',
  hosts: ['cdninstagram.com', 'fbcdn.net'],
  match: (u, ctx) => META_CDN.test(u.hostname) && isThreadsPage(ctx.pageUrl),
  resolve: (u, ctx): MediaCandidate[] => {
    const el = ctx.el as HTMLImageElement | undefined;
    const srcset = el?.getAttribute?.('srcset') || el?.getAttribute?.('data-srcset') || '';
    const best = srcset ? widestCandidate(srcset) : null;

    let chosen: { url: string; width: number } | null = null;
    if (best) {
      try {
        const abs = new URL(best.url, document.baseURI);
        if (META_CDN.test(abs.hostname)) chosen = { url: abs.href, width: best.width };
      } catch {
        /* not a URL — ignore the candidate */
      }
    }

    const url = chosen?.url || u.href;
    const cand: MediaCandidate = { url, kind: 'image' };
    const ext = imageExtFromUrl(url);
    if (ext) cand.ext = ext;
    if (chosen && chosen.width > 0) {
      cand.width = chosen.width;
      if (el?.naturalWidth && el.naturalHeight) {
        cand.height = Math.round((chosen.width * el.naturalHeight) / el.naturalWidth);
      }
    }
    return [cand];
  },
};
