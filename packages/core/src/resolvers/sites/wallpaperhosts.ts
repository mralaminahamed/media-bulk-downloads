import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { pageHost, pinnedDomUrl } from '@mbd/core/resolvers/sites/pageOriginal';

interface SiteConfig {
  /** CSS selector for the download/original anchors on the detail page. */
  selector: string;
}
const SITES: Record<string, SiteConfig> = {
  '4kwallpapers.com': { selector: 'a[href^="/images/wallpapers/"]' },
  'wallpaperswide.com': { selector: 'div.wallpaper-resolutions a[href^="/download/"]' },
};

/** Pull the largest `<W>x<H>` dimensions from a download href, or null. */
function areaOf(href: string): number | null {
  const m = href.match(/(\d{2,5})x(\d{2,5})/);
  if (!m) return null;
  return Number(m[1]) * Number(m[2]);
}

/**
 * 4kWallpapers / WallpapersWide detail-page resolver. Enumerates the page's
 * download anchors and returns the largest-area one (the native original),
 * absolutized against the page URL and host-pinned. Network-free, images only.
 */
export const wallpaperHostsResolver: Resolver = {
  id: 'wallpaper-hosts',
  match: (_u, ctx) => {
    const host = pageHost(ctx);
    return host !== null && host in SITES;
  },
  resolve: (u, ctx): MediaCandidate[] => {
    const host = pageHost(ctx);
    const doc = ctx.el?.ownerDocument;
    if (!host || !doc) return [];
    const cfg = SITES[host];
    if (!cfg) return [];
    let best: { href: string; area: number } | null = null;
    for (const a of Array.from(doc.querySelectorAll(cfg.selector))) {
      const href = a.getAttribute('href');
      if (!href) continue;
      const area = areaOf(href);
      if (area === null) continue;
      if (!best || area > best.area) best = { href, area };
    }
    if (!best) return [];
    const full = pinnedDomUrl(best.href, [host], ctx.pageUrl);
    if (!full || full === u.href) return [];
    const ext = extensionFromUrl(full);
    const c: MediaCandidate = { url: full, kind: 'image', thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    return [c];
  },
};
