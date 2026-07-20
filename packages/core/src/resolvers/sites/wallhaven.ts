import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

const FULL_SRC = /w\.wallhaven\.cc\/full\/[a-z0-9]{2}\/wallhaven-([a-z0-9]+)\.(jpg|png|gif)/i;
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
  const dataId = fig?.dataset?.wallpaperId;
  if (dataId && /^[a-z0-9]+$/i.test(dataId)) return dataId;
  const href = fig?.querySelector?.('a.preview')?.getAttribute?.('href') ?? '';
  const hm = href.match(/\/w\/([a-z0-9]+)(?:[/?#]|$)/i);
  return hm ? hm[1] : null;
}

/** Reads the real full-file extension from the DOM only (never guesses jpg).
 *  Every full-<img> source is verified to carry THIS wallpaper's id, so a
 *  different wallpaper's full image elsewhere in the DOM (a grid hover/preview
 *  modal) can't leak its extension onto this thumb and build a 404 URL. */
function extFrom(ctx: ResolveContext, id: string): 'jpg' | 'png' | 'gif' | null {
  const el = ctx.el;
  if (!el) return null;
  const idMatches = (m: RegExpMatchArray | null | undefined): 'jpg' | 'png' | 'gif' | null =>
    m && m[1].toLowerCase() === id.toLowerCase() ? (m[2].toLowerCase() as 'jpg' | 'png' | 'gif') : null;

  const own = ((el.getAttribute?.('src') || '') + ' ' + (el.getAttribute?.('data-src') || '')).match(FULL_SRC);
  const byOwn = idMatches(own);
  if (byOwn) return byOwn;
  const main = el.ownerDocument?.querySelector('#wallpaper[src]')?.getAttribute('src')?.match(FULL_SRC);
  const byMain = idMatches(main);
  if (byMain) return byMain;

  const fig = el.closest?.('figure');
  if (fig) {
    if (fig.querySelector('span.png')) return 'png';
    if (fig.querySelector('span.gif')) return 'gif';
    return 'jpg';
  }
  return null;
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
  hosts: ['wallhaven.cc'],
  match: (u) => u.hostname === 'th.wallhaven.cc',
  resolve: (u, ctx): MediaCandidate[] => {
    const id = idFrom(u, ctx);
    if (!id) return [];
    const dims = dimsFrom(ctx);
    const ext = extFrom(ctx, id);
    const thumbnailSrc = upgradeThumb(u.href, 'lg');
    if (!ext) {
      return [{ url: upgradeThumb(u.href, 'orig'), kind: 'image', thumbnailSrc, resolveHint: { platform: 'wallhaven', id }, ...(dims ?? {}) }];
    }
    const ab = id.slice(0, 2);
    return [{
      url: `https://w.wallhaven.cc/full/${ab}/wallhaven-${id}.${ext}`,
      kind: 'image', ext, thumbnailSrc, ...(dims ?? {}),
    }];
  },
};
