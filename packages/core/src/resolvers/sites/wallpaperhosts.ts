import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { pageHost, pinnedDomUrl } from '@mbd/core/resolvers/sites/pageOriginal';

// Self-hosted wallpaper sites where the native max resolution is NOT derivable by
// URL grammar (non-standard aspect, unique per wallpaper) — it must be read from
// the page's list of download links, picking the largest by pixel area. Each site
// serves the file same-origin, so gate + host-pin on the page host itself.
interface SiteConfig {
  /** CSS selector for the download/original anchors on the detail page. */
  selector: string;
}
const SITES: Record<string, SiteConfig> = {
  // 4kWallpapers: /images/wallpapers/<slug>-<WxH>-<id>.jpg; the native original is
  // the largest-area anchor (a#resolution.current), the rest are standard crops.
  '4kwallpapers.com': { selector: 'a[href^="/images/wallpapers/"]' },
  // WallpapersWide: /download/<slug>-wallpaper-<WxH>.jpg in a resolutions list;
  // the offered max varies per wallpaper, so read the list rather than guess.
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
    if (!full || full === u.href) return []; // no download link / already the original
    const ext = extensionFromUrl(full);
    const c: MediaCandidate = { url: full, kind: 'image', thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    return [c];
  },
};
