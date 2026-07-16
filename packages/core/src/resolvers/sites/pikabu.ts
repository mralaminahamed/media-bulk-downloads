import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { kindFromExt, pageHost, pinnedDomUrl } from '@mbd/core/resolvers/sites/pageOriginal';

// Gated on the PAGE host (media lives on cs*.pikabu.ru, a different host than the
// story page). Images only — Pikabu "video" is a converted GIF/short clip served
// as a direct webm/mp4, which flows through the A/V collection path, not here.
const HOSTS = new Set(['pikabu.ru', 'www.pikabu.ru']);
const IMG_HOSTS = ['pikabu.ru']; // cs*.pikabu.ru — same registrable domain

/**
 * Pikabu story-image resolver. A post image is displayed as `img.story-image__image`
 * but wrapped in `a.story-image__link` whose href is the `/post_img/big/` original;
 * read that anchor (element-scoped, so each image in a story resolves its own),
 * host-pinned to cs*.pikabu.ru.
 *
 * NEEDS-LIVE-CONFIRMATION: pikabu.ru sits behind a DDoS-Guard interstitial that
 * blocks server-side fetchers (and didn't clear in a headless browser), so these
 * selectors are reconstructed from the current community userscript, not a live DOM
 * capture. Fail-closed: a stale/missing selector or an off-host href returns [] (no
 * upgrade — the displayed image still downloads), never a wrong URL.
 */
export const pikabuResolver: Resolver = {
  id: 'pikabu',
  match: (_u, ctx) => {
    const host = pageHost(ctx);
    return host !== null && HOSTS.has(host);
  },
  resolve: (u, ctx): MediaCandidate[] => {
    const el = ctx.el;
    if (!el) return [];
    const href =
      el.closest?.('a.story-image__link')?.getAttribute?.('href') ??
      el.closest?.('.story-image')?.querySelector?.('a.story-image__link')?.getAttribute?.('href') ??
      null;
    const full = pinnedDomUrl(href, IMG_HOSTS);
    if (!full || full === u.href) return []; // no bigger original / already the original
    const ext = extensionFromUrl(full);
    const c: MediaCandidate = { url: full, kind: kindFromExt(ext), thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    return [c];
  },
};
