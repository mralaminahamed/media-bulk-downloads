import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

/**
 * Magnific (magnific.com) stock-image resolver.
 *
 * Magnific serves its display previews from `img.magnific.com` as a responsive
 * `srcset` — the SAME photo at several widths (360/740/1060/1480/2000w), and
 * each width carries its OWN short-lived signature token (`?t=…&w=…`). Two
 * consequences the generic pipeline handles badly:
 *
 *  1. Every srcset width is a distinct URL, so one photo lands as up-to-five
 *     duplicate grid items. This resolver collapses them: for any width variant
 *     of a photo it returns the single widest same-host variant, so dedup (which
 *     keys on the output URL) folds them into one item — largest wins, the
 *     smaller becomes its thumbnail.
 *  2. The token is bound to its width. Stripping it drops the image to the tiny
 *     626px `og:image` default; raising `w` past the signed value is rejected by
 *     the CDN. So the generic "strip the query string" upgrade would DOWNGRADE
 *     magnific. We therefore never touch the signature and never invent a width.
 *
 * Policy: this only re-selects a preview the page itself already loaded, using
 * magnific's own page-issued tokens — the same envelope as the Unsplash/Pexels
 * resolvers. It does NOT forge or alter signatures, request a resolution beyond
 * what the site served, bypass login, or touch magnific's licensed "Download"
 * endpoint. Licensing/attribution under magnific's terms stays the user's
 * responsibility.
 */

const CDN_HOST = 'img.magnific.com';

interface Variant {
  url: string;
  width: number;
}

/** Width a magnific CDN URL declares via its `?w=` param (0 when absent). */
function widthOf(url: string): number {
  try {
    const w = Number(new URL(url).searchParams.get('w'));
    return Number.isFinite(w) && w > 0 ? w : 0;
  } catch {
    return 0;
  }
}

/** Same-host image extension from the path, defaulting to jpg (magnific photos). */
function extOf(u: URL): string {
  const m = u.pathname.match(/\.(jpe?g|png|webp|avif|gif)$/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

/**
 * All `img.magnific.com` variants offered by the element's srcset attributes,
 * each with its width descriptor (falling back to the URL's own `?w=`). Every
 * URL is host-pinned to the CDN before it is trusted, so a page can't smuggle an
 * off-host URL into the output through a crafted srcset entry.
 */
function variantsFromEl(el: Element | undefined): Variant[] {
  if (!el?.getAttribute) return [];
  const out: Variant[] = [];
  for (const attr of ['srcset', 'data-srcset', 'data-lazy-srcset']) {
    const ss = el.getAttribute(attr);
    if (!ss) continue;
    for (const m of ss.matchAll(/([^\s,]+)\s+([\d.]+)([wx])/g)) {
      const raw = m[1];
      let host: string;
      try {
        host = new URL(raw).hostname;
      } catch {
        continue;
      }
      if (host !== CDN_HOST) continue;
      const descr = m[3] === 'w' ? Number(m[2]) : 0;
      out.push({ url: raw, width: descr || widthOf(raw) });
    }
  }
  return out;
}

export const magnificResolver: Resolver = {
  id: 'magnific',
  hosts: ['magnific.com'],
  match: (u) => u.hostname === CDN_HOST,
  resolve: (u, ctx: ResolveContext): MediaCandidate[] => {
    const candidates: Variant[] = [{ url: u.href, width: widthOf(u.href) }, ...variantsFromEl(ctx.el)];

    let best = candidates[0];
    for (const v of candidates) if (v.width > best.width) best = v;

    const c: MediaCandidate = { url: best.url, kind: 'image', ext: extOf(new URL(best.url)) };

    let thumb: Variant | null = null;
    for (const v of candidates) {
      if (v.url === best.url) continue;
      if (!thumb || (v.width && (thumb.width === 0 || v.width < thumb.width))) thumb = v;
    }
    if (thumb) c.thumbnailSrc = thumb.url;

    if (best.width > 0) {
      c.width = best.width;
      const img = ctx.el as HTMLImageElement | undefined;
      const nw = img?.naturalWidth ?? 0;
      const nh = img?.naturalHeight ?? 0;
      if (nw > 0 && nh > 0) c.height = Math.round((best.width * nh) / nw);
    }

    return [c];
  },
};
