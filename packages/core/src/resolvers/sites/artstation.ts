import { upgradeToOriginal } from '@mbd/core/collection/imageUrl';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

const ASSET = /\/p\/assets\/.*\/images\/.*\/(micro_square|smaller_square|small_square|small|medium|large|4k)\//i;
const ARTWORK = /\/artwork\/([A-Za-z0-9]+)/;

function hashFrom(el: Element | undefined, pageUrl: string | undefined): string | null {
  const href = el?.closest?.('a[href*="/artwork/"]')?.getAttribute('href');
  return href?.match(ARTWORK)?.[1] ?? pageUrl?.match(ARTWORK)?.[1] ?? null;
}

/** True when the cell shows a video clip (durable, semantic signals only). */
function hasVideoSignal(el: Element | undefined): boolean {
  if (!el?.closest) return false;
  const cell = el.closest('[data-test-id]') ?? el.closest('a[href*="/artwork/"]')?.parentElement ?? el.parentElement ?? el;
  return !!cell?.querySelector?.('video, iframe[src*="embed.html"], [class*="video" i], [data-test-id*="video" i]');
}

/**
 * ArtStation. Runs before the generic resolver for `cdn[ab].artstation.com` assets:
 *  - a video-clip artwork (durable video signal + a recoverable project hash) → a
 *    pending video whose direct mp4 the opt-in tier pulls from the project's embed;
 *  - an image → the `/large/` upgrade the generic rule already does (delegated to
 *    `upgradeToOriginal`), plus a hint so the tier can try `/4k/` (bigger than
 *    `/large/`; the CDN's `/original/` is 403-disabled, so `/4k/` is the ceiling).
 */
export const artstationResolver: Resolver = {
  id: 'artstation',
  hosts: ['artstation.com'],
  match: (u) => /^cdn[ab]\.artstation\.com$/i.test(u.hostname) && ASSET.test(u.pathname),
  resolve: (u, ctx): MediaCandidate[] => {
    if (hasVideoSignal(ctx.el)) {
      const hash = hashFrom(ctx.el, ctx.pageUrl);
      if (hash) {
        return [{
          url: u.href,
          kind: 'video',
          ext: 'mp4',
          poster: u.href,
          unresolvedVideo: true,
          resolveHint: { platform: 'artstation', id: `vid ${hash}` },
        }];
      }
    }

    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    const ext = imageExtFromUrl(original);
    if (ext) c.ext = ext;
    c.resolveHint = { platform: 'artstation', id: `img ${original}` };
    return [c];
  },
};
