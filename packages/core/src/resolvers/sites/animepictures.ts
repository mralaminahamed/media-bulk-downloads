import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

/**
 * anime-pictures.net (booru-family, network-free DOM read). A post page
 * (`anime-pictures.net/posts/<id>`) displays only a downscaled AVIF preview
 * (`opreviews.anime-pictures.net/<md5[0:3]>/<md5>_bp.avif`, also the og:image);
 * the true original is not a public md5 path — it is served by the site's own
 * download endpoint, linked from the page as `<a class="icon-download"
 * href="https://api.anime-pictures.net/pictures/download_image/<slug>.<ext>">`.
 * That endpoint is session-gated (a logged-in user's cookie unlocks it; logged
 * out it 403s), so this resolver only surfaces the URL the page itself links —
 * it never fabricates one — and the browser's own download (chrome.downloads,
 * which carries the user's cookies) fetches it, exactly as the site's download
 * button does. No circumvention: the endpoint enforces its own gate.
 *
 * Only the MAIN post image is upgraded: a post page also lists related-post
 * preview thumbnails (different md5) that must not all be mapped to this post's
 * single download link, so the resolver upgrades a preview only when its md5
 * matches the og:image's. Related thumbnails and any non-post page → `[]`.
 */

const PREVIEW_HOST = 'opreviews.anime-pictures.net';
const PAGE_HOST_RE = /^(?:www\.)?anime-pictures\.net$/i;
// The download endpoint lives on api.anime-pictures.net — pin to the registrable
// domain so a tampered href can't point the download off-site.
const DOWNLOAD_RE = /\/pictures\/download_image\//;

function pageHost(ctx: ResolveContext): string {
  try { return new URL(ctx.pageUrl ?? '').hostname.toLowerCase(); } catch { return ''; }
}

/** The 32-hex md5 that shards an opreviews preview path, or null. */
function previewMd5(pathname: string): string | null {
  return pathname.match(/\/([0-9a-f]{32})_[a-z]{2}\.avif$/i)?.[1]?.toLowerCase() ?? null;
}

/** Pin a page-supplied download URL to https on the anime-pictures.net domain and
 *  the download_image path, else null (a tampered href never becomes a target). */
function pinnedDownload(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url, document.baseURI);
    const okHost = u.hostname === 'anime-pictures.net' || u.hostname.endsWith('.anime-pictures.net');
    if (u.protocol !== 'https:' || !okHost || !DOWNLOAD_RE.test(u.pathname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

export const animePicturesResolver: Resolver = {
  id: 'animepictures',
  hosts: [PREVIEW_HOST],
  match: (u, ctx) => u.hostname === PREVIEW_HOST && PAGE_HOST_RE.test(pageHost(ctx)),
  resolve: (u, ctx): MediaCandidate[] => {
    const md5 = previewMd5(u.pathname);
    if (!md5) return [];
    const doc = ctx.el?.ownerDocument ?? (typeof document !== 'undefined' ? document : undefined);
    if (!doc) return [];

    // Upgrade only the main post image (its md5 matches the og:image preview).
    const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (!og || previewMd5(new URL(og, document.baseURI).pathname) !== md5) return [];

    const href = doc.querySelector('a.icon-download, a[href*="/pictures/download_image/"]')?.getAttribute('href');
    const original = pinnedDownload(href);
    if (!original) return [];

    const ext = original.match(/\.([a-z0-9]{3,4})$/i)?.[1]?.toLowerCase();
    const c: MediaCandidate = {
      url: original,
      kind: ext === 'gif' ? 'gif' : 'image',
      thumbnailSrc: u.href,
      mediaKey: `animepictures ${md5}`,
    };
    if (ext) c.ext = ext;
    return [c];
  },
};
