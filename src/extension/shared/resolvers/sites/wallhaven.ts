import { MediaCandidate, Resolver, ResolveContext } from '../types';

const FULL_SRC = /w\.wallhaven\.cc\/full\/[a-z0-9]{2}\/wallhaven-[a-z0-9]+\.(jpg|png|gif)/i;
const THUMB_TIER = /^(https?:\/\/th\.wallhaven\.cc)\/(small|lg|orig)\/([a-z0-9]{2}\/[a-z0-9]+\.jpg)$/i;
const TIER_RANK = { small: 0, lg: 1, orig: 2 } as const;

/**
 * Rewrite a `th.wallhaven.cc` thumb to a larger size tier (`small` < `lg` < `orig`).
 * Only ever upgrades — never downgrades a URL the page already served bigger — and
 * leaves non-thumb URLs untouched. `/orig/` is the full-resolution jpg re-encode;
 * `/lg/` is a lightweight, sharper grid preview.
 */
function upgradeThumb(url: string, tier: 'lg' | 'orig'): string {
  const m = url.match(THUMB_TIER);
  if (!m) return url;
  const cur = m[2].toLowerCase() as keyof typeof TIER_RANK;
  return TIER_RANK[tier] > TIER_RANK[cur] ? `${m[1]}/${tier}/${m[3]}` : url;
}

function idFrom(u: URL, ctx: ResolveContext): string | null {
  const m = u.pathname.match(/^\/(?:small|lg|orig)\/[a-z0-9]{2}\/([a-z0-9]+)\.jpg$/i);
  if (m) return m[1];

  const fig = ctx.el?.closest?.('figure') as HTMLElement | null;
  // Both grid-DOM fallbacks are page-controlled and get interpolated into a URL
  // path, so require the real id shape (alphanumeric) — a value with '/', '?', or
  // '..' could bend the constructed wallhaven URL.
  // (a) The figure's `data-wallpaper-id`.
  const dataId = fig?.dataset?.wallpaperId;
  if (dataId && /^[a-z0-9]+$/i.test(dataId)) return dataId;
  // (b) The figure's preview link (`a.preview` -> `/w/<id>`) — a second source when
  //     the id attribute is absent. The `[a-z0-9]+` capture is inherently id-shaped.
  const href = fig?.querySelector?.('a.preview')?.getAttribute?.('href') ?? '';
  const hm = href.match(/\/w\/([a-z0-9]+)(?:[/?#]|$)/i);
  return hm ? hm[1] : null;
}

/** Reads the real full-file extension from the DOM only (never guesses jpg). */
function extFrom(ctx: ResolveContext): 'jpg' | 'png' | 'gif' | null {
  const el = ctx.el;
  if (!el) return null;

  // (1) A full <img> reachable from the element (the /w/<id> detail page).
  const full = (el.getAttribute?.('src') || '') + ' ' + (el.getAttribute?.('data-src') || '');
  const dm = full.match(FULL_SRC);
  if (dm) return dm[1].toLowerCase() as 'jpg' | 'png' | 'gif';
  const pageImg = el.ownerDocument?.querySelector('#wallpaper[src], img[src*="w.wallhaven.cc/full/"]');
  const pm = pageImg?.getAttribute('src')?.match(FULL_SRC);
  if (pm) return pm[1].toLowerCase() as 'jpg' | 'png' | 'gif';

  // (2) The PNG/GIF badge on grid figures (`span.png` / `span.gif`, confirmed live);
  //     Wallhaven only badges non-jpg, so an unbadged figure is genuinely jpg.
  const fig = el.closest?.('figure');
  if (fig) {
    if (fig.querySelector('span.png')) return 'png';
    if (fig.querySelector('span.gif')) return 'gif';
    return 'jpg';
  }
  return null; // bare thumb, no context -> Phase 2 probe
}

/** Real wallpaper dimensions from the grid figure's resolution label
 *  (`span.wall-res` = "1920 x 1200"). Null off-grid / when absent or implausible. */
function dimsFrom(ctx: ResolveContext): { width: number; height: number } | null {
  const txt = ctx.el?.closest?.('figure')?.querySelector?.('.wall-res')?.textContent ?? '';
  const m = txt.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

export const wallhavenResolver: Resolver = {
  id: 'wallhaven',
  match: (u) => u.hostname === 'th.wallhaven.cc',
  resolve: (u, ctx): MediaCandidate[] => {
    const id = idFrom(u, ctx);
    if (!id) return [];
    const dims = dimsFrom(ctx);
    const ext = extFrom(ctx);
    // Sharper-but-lightweight grid preview: a tiny /small/ thumb bumps up to /lg/.
    const thumbnailSrc = upgradeThumb(u.href, 'lg');
    if (!ext) {
      // No DOM extension evidence: hand back the largest guaranteed-existing jpg
      // (/orig/) as the downloadable and tag for opt-in exact resolve — never a
      // blind w.wallhaven.cc full-file URL that could 404 for a png.
      return [{ url: upgradeThumb(u.href, 'orig'), kind: 'image', thumbnailSrc, resolveHint: { platform: 'wallhaven', id }, ...(dims ?? {}) }];
    }
    const ab = id.slice(0, 2);
    return [{
      url: `https://w.wallhaven.cc/full/${ab}/wallhaven-${id}.${ext}`,
      kind: 'image', ext, thumbnailSrc, ...(dims ?? {}),
    }];
  },
};
