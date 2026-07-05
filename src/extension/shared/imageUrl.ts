/**
 * Pure, network-free helpers for everything derivable from an image URL string:
 * type detection (extension or query param), dimension parsing, and CDN upgrade
 * to the original asset. No requests are ever issued here.
 */
import { getImageType } from '@/extension/collect';

/** Normalizes a raw format token (extension or query value) to our type vocab. */
function normalizeFormat(raw: string): string {
  const ext = raw.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'jfif':
      return 'jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'avif':
    case 'bmp':
    case 'ico':
      return ext;
    default:
      return 'unknown';
  }
}

/**
 * Image type from the URL: file extension first, then `format=`/`fm=` query
 * params for extension-less dynamic CDN URLs. Falls back to 'unknown'.
 */
export function detectType(url: string): string {
  const byExt = getImageType(url);
  if (byExt !== 'unknown') return byExt;
  try {
    const params = new URL(url).searchParams;
    const fmt = params.get('format') ?? params.get('fm');
    if (fmt) return normalizeFormat(fmt);
  } catch {
    /* fall through */
  }
  return 'unknown';
}

/** Known media CDN hostnames (used by looksLikeMediaUrl + the gallery-link rule). */
const MEDIA_HOSTS = /(?:^|\.)(?:pbs\.twimg\.com|cdn\.shopify\.com|images\.unsplash\.com|plus\.unsplash\.com|i\.pinimg\.com|i\.ytimg\.com|img\.youtube\.com|i\.redd\.it|preview\.redd\.it|miro\.medium\.com|lh\d\.googleusercontent\.com|googleusercontent\.com|ggpht\.com|media-amazon\.com|ssl-images-amazon\.com|wp\.com|imgix\.net)$/i;

const MEDIA_EXT = /\.(?:jpe?g|jfif|png|gif|webp|avif|bmp|ico|svg|mp4|m4v|webm|ogv|mov|mp3|wav|ogg|oga|m4a|aac|flac|opus)(?:$|[?#])/i;

/** Audio/video format tokens not covered by normalizeFormat (which is image-only). */
const AV_FORMATS = new Set([
  'mp4', 'm4v', 'webm', 'ogv', 'ogg', 'mov', 'mp3', 'wav', 'oga', 'm4a', 'aac', 'flac', 'opus',
]);

/** Does this `format=`/`fm=` value name a known image or av/audio format? */
function isKnownMediaFormat(raw: string): boolean {
  if (normalizeFormat(raw) !== 'unknown') return true;
  return AV_FORMATS.has(raw.toLowerCase());
}

/** Heuristic: does this URL point at a media file (by extension, host, or format param)? */
export function looksLikeMediaUrl(url: string): boolean {
  if (MEDIA_EXT.test(url)) return true;
  try {
    const u = new URL(url);
    if (MEDIA_HOSTS.test(u.hostname)) return true;
    const fmt = u.searchParams.get('format') ?? u.searchParams.get('fm');
    if (fmt && isKnownMediaFormat(fmt)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

const PROXY_PARAMS = ['url', 'u', 'src', 'image', 'imgurl'];

/**
 * Unwraps an image hidden behind a proxy, at most once. Returns the absolute
 * inner URL when it clearly points at media, else null (caller keeps the input).
 */
export function deproxy(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  // Cloudinary fetch: /image/fetch/<transforms?>/<inner-url>
  if (/\/image\/fetch\//.test(u.pathname)) {
    const after = u.pathname.split('/image/fetch/')[1] ?? '';
    const inner = after.replace(/^(?:[^/]*_[^/]*\/)+/, ''); // drop leading transform segments
    const decoded = safeDecode(inner) + (u.search || '');
    const abs = /^https?:\/\//i.test(decoded) ? decoded : null;
    if (abs && looksLikeMediaUrl(abs)) return abs;
  }

  // weserv: host serves ?url=<host/path> (often without scheme)
  if (/(?:^|\.)(?:images\.weserv\.nl|wsrv\.nl)$/i.test(u.hostname)) {
    const raw = u.searchParams.get('url');
    if (raw) {
      const decoded = safeDecode(raw);
      const abs = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded}`;
      if (looksLikeMediaUrl(abs)) return abs;
    }
  }

  // Next.js /_next/image and any generic ?url=/?src=/... param.
  for (const key of PROXY_PARAMS) {
    const raw = u.searchParams.get(key);
    if (!raw) continue;
    const decoded = safeDecode(raw);
    const abs = /^https?:\/\//i.test(decoded) ? decoded : null;
    if (abs && looksLikeMediaUrl(abs)) return abs;
  }

  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** A standalone `WxH` token, e.g. 360x480 — not part of a longer number run. */
const WxH = /(?<![\d])(\d{2,5})x(\d{2,5})(?![\d])/i;

/**
 * Best-effort pixel dimensions encoded in a URL. Handles `name=WxH`, bare `WxH`
 * size tokens (Shopify `_800x600`, generic), and `w=`/`h=` query params. Named
 * sizes (orig/large/scaled) and size-free URLs return null. A single known axis
 * yields the other as 0.
 */
export function parseUrlDimensions(url: string): { width: number; height: number } | null {
  const wh = url.match(WxH);
  if (wh) return { width: parseInt(wh[1], 10), height: parseInt(wh[2], 10) };

  try {
    const params = new URL(url).searchParams;
    const w = parseInt(params.get('w') ?? '', 10);
    const h = parseInt(params.get('h') ?? '', 10);
    if (Number.isFinite(w) || Number.isFinite(h)) {
      return { width: Number.isFinite(w) ? w : 0, height: Number.isFinite(h) ? h : 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** A CDN upgrade rule: match a URL by host/shape, then rewrite it to the original. */
interface CdnRule {
  match: (u: URL) => boolean;
  rewrite: (u: URL) => void;
}

/** Removes the named query params from a URL in place. */
function dropParams(u: URL, keys: string[]): void {
  keys.forEach((k) => u.searchParams.delete(k));
}

const RESIZE_PARAMS = ['w', 'h', 'fit', 'resize', 'quality', 'q', 'dpr', 'crop'];

const RULES: CdnRule[] = [
  {
    // Twitter/X: name=<size> -> name=orig, keep format.
    match: (u) => u.hostname === 'pbs.twimg.com',
    rewrite: (u) => {
      if (u.searchParams.has('name')) u.searchParams.set('name', 'orig');
    },
  },
  {
    // WordPress / Jetpack Photon.
    match: (u) => /(^|\.)wp\.com$/.test(u.hostname) || /\.files\.wordpress\.com$/.test(u.hostname),
    rewrite: (u) => {
      dropParams(u, RESIZE_PARAMS);
      u.pathname = u.pathname.replace(/-scaled(?=\.[a-z0-9]+$)/i, '');
    },
  },
  {
    // Shopify: classic cdn.shopify.com uses a _WxH path suffix; modern stores
    // serve from their own domain under /cdn/shop/ with ?width=/&height= query
    // resizers. Handle both.
    match: (u) => u.hostname === 'cdn.shopify.com' || u.pathname.includes('/cdn/shop/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /_(?:\d{1,5}x\d{1,5}|\d{1,5}x|x\d{1,5})(@\dx)?(?=\.[a-z0-9]+$)/i,
        '',
      );
      dropParams(u, ['width', 'height', 'crop', 'pad_color']);
    },
  },
  {
    // Unsplash (images + plus) + Imgix: query-param resizers.
    match: (u) =>
      /(?:^|\.)(?:images|plus)\.unsplash\.com$/.test(u.hostname) || /\.imgix\.net$/.test(u.hostname),
    rewrite: (u) => dropParams(u, RESIZE_PARAMS),
  },
  {
    // Cloudinary: remove the transform segment right after /upload/.
    match: (u) => u.hostname === 'res.cloudinary.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /\/upload\/[^/]*(?:w_|h_|c_|q_)[^/]*\//,
        '/upload/',
      );
    },
  },
  {
    // MediaWiki (Wikimedia + self-hosted wikis like wikiHow/Fandom):
    // /thumb/<path>/<size>px-<name> -> /<path>. Host-agnostic — the trailing
    // `<size>px-<name>` segment after a `/thumb/` is the MediaWiki thumbnail
    // signature. See #76.
    match: (u) => u.pathname.includes('/thumb/') && /\/[^/]*px-[^/]+$/i.test(u.pathname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/thumb\//, '/').replace(/\/[^/]*px-[^/]+$/i, '');
    },
  },
  {
    // Google usercontent / ggpht: normalize the trailing =size segment to full.
    match: (u) => /(?:^|\.)googleusercontent\.com$|(?:^|\.)ggpht\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/=(?:[swh]\d+|[a-z]\d+)(?:-[a-z0-9]+)*$/i, '=s0');
    },
  },
  {
    // Pinterest: /<NNNx>/ or /<NNNxNNN>/ size folder -> /originals/.
    match: (u) => u.hostname === 'i.pinimg.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/^\/\d+x(?:\d+)?\//, '/originals/');
    },
  },
  {
    // YouTube: upgrade a small thumb to hqdefault (the largest variant that is
    // ALWAYS present for a valid id). maxresdefault/sddefault are NOT guaranteed
    // — they 404 for many videos — and collection is network-free, so we can't
    // probe them; synthesizing maxresdefault replaced a working thumb with a dead
    // link. Only the small defaults are rewritten; hqdefault/sddefault/
    // maxresdefault already on the page are left as-is. See #74.
    match: (u) => u.hostname === 'i.ytimg.com' || u.hostname === 'img.youtube.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\/vi\/[^/]+\/)(?:default|mqdefault|[0-3])\.jpg$/i, '$1hqdefault.jpg');
    },
  },
  {
    // Amazon: strip the ._SX300_SY300_. style encoding segment before the ext.
    match: (u) => /(?:^|\.)(?:media-amazon\.com|ssl-images-amazon\.com)$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\._[^.]*_(?=\.[a-z0-9]+$)/i, '');
    },
  },
  {
    // Medium: miro.medium.com/v2/resize:fit:NNN/format:webp/<id> -> /<id> (drop chained transforms).
    match: (u) => u.hostname === 'miro.medium.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/v2\/(?:(?:resize|fit|format|max|frame|crop)[^/]*\/)*/, '/');
    },
  },
  {
    // Pexels: query-param resizer; the bare path is the original.
    match: (u) => u.hostname === 'images.pexels.com',
    rewrite: (u) => { u.search = ''; },
  },
  {
    // Pixabay: filename _<size> -> _1280 (largest hotlinkable; true original is login-gated).
    match: (u) => u.hostname === 'cdn.pixabay.com',
    rewrite: (u) => { u.pathname = u.pathname.replace(/_\d{2,4}(?=\.[a-z0-9]+$)/i, '_1280'); },
  },
  {
    // Flickr: trailing _<size> code -> _b (1024) only for sizes smaller than _b.
    // The 10-char secret is never matched (regex requires a short 1-3 char code before the ext).
    match: (u) => /(?:^|\.)staticflickr\.com$/i.test(u.hostname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/_[sqtmnwzc](?=\.[a-z0-9]+$)/i, '_b'); },
  },
  // Tumblr (*.media.tumblr.com): the CDN pre-renders exactly one size folder per
  // image; every other /s<W>x<H>/ variant 404s, and the served size is often
  // already the maximum (e.g. /s2048x3072/). Size folders are not swappable
  // offline, so there is deliberately no rule — a blind rewrite only replaced a
  // working image with a dead link (and downgraded the max). See #72.
  {
    // BBC: the width segment (/news/640/, /ace/standard/240/) -> 2048. 1920 does
    // NOT exist on the /news/ path (404); 2048 is served on both news and
    // standard, so it is the safe largest common target. See #73.
    match: (u) => u.hostname === 'ichef.bbci.co.uk',
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/(news|standard)\/\d{2,4}\//, '/$1/2048/'); },
  },
  {
    // Etsy: il_<W>x<H> render token -> il_fullxfull.
    match: (u) => u.hostname === 'i.etsystatic.com',
    rewrite: (u) => { u.pathname = u.pathname.replace(/il_\d+x(?:\d+|N)/i, 'il_fullxfull'); },
  },
  {
    // eBay: s-l<NNN> size token -> s-l1600.
    match: (u) => u.hostname === 'i.ebayimg.com',
    rewrite: (u) => { u.pathname = u.pathname.replace(/s-l\d+(?=\.[a-z0-9]+$)/i, 's-l1600'); },
  },
  {
    // The Verge: WordPress uploads path with resize query -> strip the resizer query.
    match: (u) => u.hostname === 'platform.theverge.com' && u.pathname.includes('/wp-content/uploads/'),
    rewrite: (u) => dropParams(u, [...RESIZE_PARAMS, 'strip', 'ssl']),
  },
  {
    // Adobe Scene7 (*.scene7.com, e.g. target.scene7.com): ?wid=&hei=&qlt=&fmt=
    // renders. Force a large wid and drop the other size/format params. Dropping
    // the query entirely returns the tiny default rendition, so wid is set
    // explicitly; oversizing just returns the source. See #78.
    match: (u) => /(?:^|\.)scene7\.com$/i.test(u.hostname),
    rewrite: (u) => {
      dropParams(u, ['hei', 'qlt', 'fmt', 'resMode', 'op_usm', 'fit']);
      u.searchParams.set('wid', '2000');
    },
  },
  {
    // ArtStation (cdn[ab].artstation.com): the path carries a size bucket
    // (smaller_square, small, medium, large, 4k). Upgrade the small crops to
    // /large/, which is always generated. /original/ is 403-disabled and /4k/ is
    // not present for every asset, so /large/ is the safe target. The
    // ?<timestamp> is a cache-buster, not a signature. See #79.
    match: (u) => /^cdn[a-z]\.artstation\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /\/(?:micro_square|smaller_square|small_square|small|medium)\//,
        '/large/',
      );
    },
  },
  {
    // AliExpress (*.alicdn.com, *.aliexpress-media.com): a transform suffix
    // follows the real extension, e.g. .jpg_640x640.jpg_.webp, .jpg_.webp,
    // .jpg_220x220xz.jpg. Cut everything after the first real image extension to
    // reach the source. See #82.
    match: (u) => /(?:^|\.)alicdn\.com$/i.test(u.hostname) || /(?:^|\.)aliexpress-media\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\.(?:jpe?g|png|webp|gif))_.*$/i, '$1');
    },
  },
  {
    // Dribbble (cdn.dribbble.com): /userupload/.../file.png?resize=WxH&vertical=
    // resizers. The bare path is the original, so drop the query. Unsigned. See #81.
    match: (u) => u.hostname === 'cdn.dribbble.com',
    rewrite: (u) => { u.search = ''; },
  },
  {
    // Walmart (i5.walmartimages.com): ?odnHeight=&odnWidth=&odnBg= resizers on
    // the /seo/ and /asr/ paths. The bare path is the full source, so drop the
    // whole query. Unsigned. See #80.
    match: (u) => /(?:^|\.)walmartimages\.com$/i.test(u.hostname),
    rewrite: (u) => { u.search = ''; },
  },
  {
    // Self-hosted WordPress: any host serving /wp-content/uploads/ with a resize
    // query (?w=&h=&resize=) and/or a stored -WxH / -scaled thumbnail suffix.
    // WordPress keeps the untouched original beside its generated sizes, so drop
    // the resize query and strip the size suffix to reach it. Host-specific WP
    // CDNs above (wp.com Photon, The Verge) match first. See #75.
    match: (u) => u.pathname.includes('/wp-content/uploads/'),
    rewrite: (u) => {
      dropParams(u, [...RESIZE_PARAMS, 'strip', 'ssl']);
      u.pathname = u.pathname
        .replace(/-\d{1,5}x\d{1,5}(?=\.[a-z0-9]+$)/i, '')
        .replace(/-scaled(?=\.[a-z0-9]+$)/i, '');
    },
  },
];

/**
 * Upgrades a known CDN URL to its original asset. Returns the rewritten URL as
 * `original` with the input kept as `thumbnail` when a rule changed it; otherwise
 * `{ original: <input> }`. Conservative: a rewrite that empties the path or drops
 * the filename is discarded. Never throws.
 */
export function upgradeToOriginal(url: string): { original: string; thumbnail?: string } {
  const unwrapped = deproxy(url);
  const start = unwrapped ?? url;

  let parsed: URL;
  try {
    parsed = new URL(start);
  } catch {
    return { original: url };
  }
  const rule = RULES.find((r) => r.match(parsed));

  const before = parsed.pathname;
  if (rule) rule.rewrite(parsed);

  // Guard: a rewrite must not destroy the filename or empty the path.
  const filename = parsed.pathname.split('/').pop() ?? '';
  if (!parsed.pathname || parsed.pathname === '/' || !filename) {
    return { original: url };
  }

  const rewritten = parsed.href;
  if (rewritten === url && parsed.pathname === before) return { original: url };
  return { original: rewritten, thumbnail: url };
}
