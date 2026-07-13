import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';

const HOST = 'i.pximg.net';

// A Pixiv work-image filename: <illustId>_p<page>[_<rendition>].<ext>, e.g.
// `122308179_p0_master1200.jpg` (regular), `..._square1200.jpg` (feed crop),
// `..._custom1200.jpg` (custom-thumb), or `122308179_p0.png` (the original).
// Avatars/badges (/user-profile/…, …_170.jpg) have no `_p<page>` and are skipped.
const WORK_FILE = /\/(\d{2,})_p(\d{1,4})(?:_(?:master|square|custom)\d+)?\.[a-z0-9]+$/i;

interface PixivPreloadUrls { original?: unknown }
interface PixivPreloadIllust { urls?: PixivPreloadUrls }
interface PixivPreload { illust?: Record<string, PixivPreloadIllust> }

/**
 * Host-pin an untrusted URL (taken from the page's own preload JSON) to the
 * pximg.net image family over https, or null. The original URL flows into
 * MediaItem.src and reaches a download/tab-open sink, so it is never trusted raw.
 */
function pinnedPximg(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === HOST || u.hostname.endsWith('.pximg.net')) ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Page 0's true original URL for `illustId`, read from the artwork page's embedded
 * `#meta-preload-data` JSON (`illust[id].urls.original`), host-pinned, or null.
 * This is the only network-free source of the ORIGINAL's real extension — the
 * displayed master is always `.jpg` even when the upload is a `.png`/`.gif`, so a
 * blind `img-master`→`img-original` rewrite would 404 for non-jpg art. The JSON is
 * present only on an artwork detail page (absent on feeds and logged-out).
 */
function originalFromPreload(doc: Document | undefined, illustId: string): string | null {
  const content = doc?.getElementById?.('meta-preload-data')?.getAttribute('content');
  if (!content) return null;
  let data: PixivPreload;
  try {
    data = JSON.parse(content) as PixivPreload;
  } catch {
    return null;
  }
  return pinnedPximg(data?.illust?.[illustId]?.urls?.original);
}

/**
 * Pixiv (`i.pximg.net`). pximg is hotlink-protected (a `Referer: pixiv.net` is
 * required to fetch it — the extension's opt-in referer retry, #197, supplies it
 * on download), so this resolver is strictly DOM-reading and network-free:
 *  - on an artwork page, the embedded preload JSON names the exact original
 *    (correct extension, all pages derived from page 0), returned host-pinned;
 *  - a `/c/<w>x<h>_…/` feed crop of a `…_master1200` master upgrades to the
 *    un-cropped master (same path, always generated — a safe upgrade);
 *  - with no preload evidence (feed tile / logged-out), the served URL is returned
 *    unchanged rather than gambling an `img-original` extension that could 404.
 */
export const pixivResolver: Resolver = {
  id: 'pixiv',
  hosts: ['pximg.net'],
  match: (u) => u.hostname === HOST && WORK_FILE.test(u.pathname),
  resolve: (u, ctx: ResolveContext): MediaCandidate[] => {
    const m = u.pathname.match(WORK_FILE);
    if (!m) return [];
    const [, id, pageStr] = m;
    const page = Number(pageStr);

    // Already the original — claim it so the download name gets the real extension.
    if (u.pathname.includes('/img-original/')) {
      const ext = imageExtFromUrl(u.href);
      return [{ url: u.href, kind: 'image', ...(ext ? { ext } : {}) }];
    }

    // Artwork page: the exact original (with its true extension) from preload JSON.
    const p0 = originalFromPreload(ctx.el?.ownerDocument ?? undefined, id);
    if (p0) {
      // preload carries page 0; a multi-page work shares one original format across
      // its pages, so derive page n by swapping the `_p0` index (ext holds).
      const derived = page === 0 ? p0 : p0.replace(/_p0(\.[a-z0-9]+)$/i, `_p${page}$1`);
      const pinned = pinnedPximg(derived);
      if (pinned) {
        const ext = imageExtFromUrl(pinned);
        return [{ url: pinned, kind: 'image', thumbnailSrc: u.href, ...(ext ? { ext } : {}) }];
      }
    }

    // No preload: strip a `/c/<crop>/` resize prefix off a `_master1200` master to
    // reach the un-cropped master (same path, always present). Only `_master1200`
    // has a same-name un-cropped sibling — a `_square1200`/`_custom1200` crop's
    // master is a different suffix we won't guess, so it is left as-is.
    const uncropped = u.pathname.replace(/^\/c\/[^/]+\/(img-master\/.*_master1200\.[a-z0-9]+)$/i, '/$1');
    if (uncropped !== u.pathname) {
      return [{ url: `${u.origin}${uncropped}`, kind: 'image', thumbnailSrc: u.href }];
    }

    // Served crop/master already works; never a dead link.
    return [{ url: u.href, kind: 'image' }];
  },
};
