import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

/**
 * Arc XP (Fusion) "resizer/v2" resolver — Reuters and many publishers built on
 * Arc XP serve responsive images through a `.../resizer/v2/<encoded-source>?
 * auth=<hmac>&width=<n>` endpoint.
 *
 * The `auth` token is an HMAC of the SOURCE asset, not of a specific width — so
 * every width the page's `<img srcset>` offers reuses the SAME token and is a
 * legitimate re-selection, exactly what the browser's responsive loader already
 * does. Two consequences, handled the same way as the magnific resolver:
 *
 *  1. Each srcset width is a distinct URL, so one photo can land as several
 *     duplicate grid items. This collapses them: for any width variant it returns
 *     the single widest same-host variant, and dedup (keyed on the output URL)
 *     folds them into one — largest wins, a smaller becomes the thumbnail.
 *  2. The generic "strip the query string" upgrade would drop the `auth` token
 *     and break the image (403 / tiny default). So this claims the URL and never
 *     touches the token.
 *
 * Policy: re-selects only a width the page itself already served via its own
 * srcset, reusing Arc's page-issued `auth` verbatim. It NEVER forges or alters
 * `auth`, invents a width the page didn't offer, or requests a size beyond the
 * source. With no wider variant on the element, the input is returned unchanged.
 */

interface Variant {
  url: string;
  width: number;
}

/** Width an Arc resizer URL declares via its `width=` param (0 when absent). */
function widthOf(url: string): number {
  try {
    const w = Number(new URL(url).searchParams.get('width'));
    return Number.isFinite(w) && w > 0 ? w : 0;
  } catch {
    return 0;
  }
}

/** Image extension from the resizer path (source id keeps its ext), default jpg. */
function extOf(u: URL): string {
  const m = u.pathname.match(/\.(jpe?g|png|webp|avif|gif)$/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

/**
 * All same-host resizer variants the element's srcset attributes offer, each with
 * its width (descriptor first, else the URL's own `width=`). Every URL is pinned
 * to the input's host before it is trusted, so a page can't smuggle an off-host
 * URL into the output through a crafted srcset entry.
 */
function variantsFromEl(el: Element | undefined, host: string): Variant[] {
  if (!el?.getAttribute) return [];
  const out: Variant[] = [];
  for (const attr of ['srcset', 'data-srcset', 'data-lazy-srcset']) {
    const ss = el.getAttribute(attr);
    if (!ss) continue;
    for (const m of ss.matchAll(/([^\s,]+)\s+([\d.]+)([wx])/g)) {
      const raw = m[1];
      let u: URL;
      try {
        u = new URL(raw);
      } catch {
        continue;
      }
      if (u.hostname !== host || !u.pathname.includes('/resizer/v2/')) continue;
      const descr = m[3] === 'w' ? Number(m[2]) : 0; // density (x) carries no pixel width
      out.push({ url: raw, width: descr || widthOf(raw) });
    }
  }
  return out;
}

export const arcxpResolver: Resolver = {
  id: 'arcxp',
  // Host-agnostic: match the resizer path shape plus the page-issued auth token
  // (both are always present on a real Arc resizer URL), so a plain `/resizer/`
  // path on an unrelated site is never claimed.
  match: (u) => u.pathname.includes('/resizer/v2/') && u.searchParams.has('auth'),
  resolve: (u, ctx: ResolveContext): MediaCandidate[] => {
    // The input URL is always a valid candidate (it's what the page loaded).
    const candidates: Variant[] = [{ url: u.href, width: widthOf(u.href) }, ...variantsFromEl(ctx.el, u.hostname)];

    // Widest wins; ties keep the input (stable, avoids needless churn).
    let best = candidates[0];
    for (const v of candidates) if (v.width > best.width) best = v;

    const c: MediaCandidate = { url: best.url, kind: 'image', ext: extOf(new URL(best.url)) };

    // Smallest OTHER same-host variant makes a lighter preview thumbnail.
    let thumb: Variant | null = null;
    for (const v of candidates) {
      if (v.url === best.url) continue;
      if (!thumb || (v.width && (thumb.width === 0 || v.width < thumb.width))) thumb = v;
    }
    if (thumb) c.thumbnailSrc = thumb.url;

    // True pixel size: the chosen width is exact; derive height from the live
    // image's aspect ratio when the element exposes its natural dimensions.
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
