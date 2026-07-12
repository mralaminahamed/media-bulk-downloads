import { upgradeToOriginal } from '@/extension/shared/collection/imageUrl';
import { imageExtFromUrl } from '@/extension/shared/collection/mediaType';
import { MediaCandidate, Resolver } from '../types';

const IMG_HOST = 'i.pinimg.com';

// A pin permalink: /pin/<digits>/ or /pin/<slug>--<digits>/. The id is the
// trailing run of digits (a slug may itself contain digits/dashes, so anchor on
// the final `--` and the closing slash).
const PIN_ID = /\/pin\/(?:[^/]*--)?(\d+)(?:\/|$)/;

function pinIdFrom(el: Element | undefined, pageUrl: string | undefined): string | null {
  const href = el?.closest?.('a[href*="/pin/"]')?.getAttribute('href');
  return href?.match(PIN_ID)?.[1] ?? pageUrl?.match(PIN_ID)?.[1] ?? null;
}

/**
 * True when the poster's pin cell shows a video. Pinterest's authed markup uses
 * obfuscated class names, so only durable, semantic signals are trusted: a
 * `<video>` in the cell, or a `data-test-id` / `aria-label` naming "video". The
 * search is bounded to the cell holding this poster's own `/pin/` link so a
 * neighbouring video pin in a grid can't mark a still pin as video.
 */
function hasVideoSignal(el: Element | undefined): boolean {
  if (!el?.closest) return false;
  const cell = el.closest('a[href*="/pin/"]')?.parentElement ?? el.closest('[data-test-id]') ?? el.parentElement ?? el;
  return !!cell?.querySelector?.('video, [data-test-id*="video" i], [aria-label*="video" i]');
}

/**
 * Pinterest. Owns `i.pinimg.com` so it runs before the generic resolver:
 *  - a still pin → the same size-folder → /originals/ upgrade the generic path
 *    would do (delegated to `upgradeToOriginal`, the single source of truth also
 *    used by the background right-click path);
 *  - a video-pin poster (durable video signal + a recoverable pin id) → a pending
 *    video whose real file (progressive mp4 or HLS master) comes from the opt-in
 *    network tier via the public pin-widget endpoint; the poster still is kept for
 *    preview but never surfaced as the downloadable media.
 * Direct `v(1).pinimg.com` `<video>` sources are already collected by the video
 * pass, so they are intentionally not matched here.
 */
export const pinterestResolver: Resolver = {
  id: 'pinterest',
  hosts: ['pinimg.com'],
  match: (u) => u.hostname === IMG_HOST,
  resolve: (u, ctx): MediaCandidate[] => {
    // Pinterest also serves video poster thumbnails under /videos/thumbnails/…;
    // those are stills, handled by the image path below like any other pin image.
    if (hasVideoSignal(ctx.el)) {
      const id = pinIdFrom(ctx.el, ctx.pageUrl);
      // Only claim a video when it is actually resolvable — without a pin id the
      // widget endpoint can't be queried, so fall through and keep the poster as a
      // downloadable image rather than surfacing an undownloadable pending video.
      if (id) {
        return [{
          url: u.href,
          kind: 'video',
          ext: 'mp4',
          poster: u.href,
          unresolvedVideo: true,
          resolveHint: { platform: 'pinterest', id },
        }];
      }
    }

    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    const ext = imageExtFromUrl(original);
    if (ext) c.ext = ext;
    return [c];
  },
};
