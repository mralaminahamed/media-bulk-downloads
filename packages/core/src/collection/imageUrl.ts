/**
 * Pure, network-free helpers for everything derivable from an image URL string:
 * type detection (extension or query param), dimension parsing, and CDN upgrade
 * to the original asset. No requests are ever issued here.
 */
/**
 * Determines the image type from its URL, ignoring query strings and fragments.
 * Returns a lowercase extension-style type, or 'unknown'.
 */
export function getImageType(src: string): string {
  const path = src.split(/[?#]/)[0];
  const lastSegment = path.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex === -1) return 'unknown';

  const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
  switch (extension) {
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
      return extension;
    default:
      return 'unknown';
  }
}

/**
 * Parses a srcset attribute into an array of URLs. Splits only on commas that
 * separate candidates — commas inside data: URIs or query strings are preserved.
 */
export function parseSrcset(srcset: string): string[] {
  return splitSrcsetCandidates(srcset)
    .map((candidate) => candidate.split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * Splits a srcset into raw candidate strings (each `URL [descriptor]`), the single
 * source of truth for candidate splitting shared by parseSrcset and bestSrcsetUrl.
 *
 * Follows the HTML srcset grammar rather than a comma regex: a candidate's URL is
 * a run of non-whitespace characters, so a comma is a candidate separator ONLY
 * when it terminates that run (a trailing comma) or comes after the descriptor.
 * Commas *inside* the URL — data: payloads, imgix query lists (`?w=1,2`), and
 * Cloudinary path transforms (`.../c_fill,w_800/img.jpg`) — stay part of the URL.
 * The old regex split inside `c_fill,w_800/`, breaking the URL and losing the image.
 */
export function splitSrcsetCandidates(srcset: string): string[] {
  const isWs = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  const out: string[] = [];
  const s = srcset;
  const n = s.length;
  let i = 0;
  while (i < n) {
    // Skip leading whitespace and stray commas between candidates.
    while (i < n && (isWs(s[i]) || s[i] === ',')) i++;
    if (i >= n) break;
    // The URL is the next run of non-whitespace characters (commas included).
    const urlStart = i;
    while (i < n && !isWs(s[i])) i++;
    let url = s.slice(urlStart, i);
    // Trailing commas on the URL run are separators, not part of the URL.
    let hadTrailingComma = false;
    while (url.endsWith(',')) { url = url.slice(0, -1); hadTrailingComma = true; }
    if (!url) continue;
    if (hadTrailingComma) { out.push(url); continue; }
    // Otherwise collect the (optional) descriptor up to the next comma.
    while (i < n && isWs(s[i])) i++;
    const descStart = i;
    while (i < n && s[i] !== ',') i++;
    const desc = s.slice(descStart, i).trim();
    out.push(desc ? `${url} ${desc}` : url);
    if (i < n && s[i] === ',') i++; // consume the separating comma
  }
  return out;
}

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
    const u = new URL(url);
    const fmt = u.searchParams.get('format') ?? u.searchParams.get('fm');
    if (fmt) return normalizeFormat(fmt);
    // Bluesky / atproto CDN encodes the format as an `@<fmt>` path suffix
    // (…/bafy…@jpeg) instead of a file extension. Read it when present.
    const at = /@([a-z0-9]+)$/i.exec(u.pathname);
    if (at) return normalizeFormat(at[1]);
  } catch {
    /* fall through */
  }
  return 'unknown';
}

/** Known media CDN hostnames (used by looksLikeMediaUrl + the gallery-link rule). */
const MEDIA_HOSTS = /(?:^|\.)(?:pbs\.twimg\.com|cdn\.shopify\.com|images\.unsplash\.com|plus\.unsplash\.com|i\.pinimg\.com|i\.ytimg\.com|img\.youtube\.com|i\.redd\.it|preview\.redd\.it|miro\.medium\.com|lh\d\.googleusercontent\.com|googleusercontent\.com|ggpht\.com|media-amazon\.com|ssl-images-amazon\.com|wp\.com|imgix\.net|cdn\.bsky\.app)$/i;

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

  // Cloudflare Images: /cdn-cgi/image/<options>/<src>, where <options> is a
  // comma-list of key=value transforms (width=800,quality=75,…) and <src> is the
  // origin image — either an absolute URL or a same-origin path. Unwrap to <src>
  // (mirrors the Cloudinary /image/fetch/ case; the src carries an image
  // extension, so this must run before the `MEDIA_EXT.test` guard below). The
  // `=` check ensures the first segment is really an options list, not a src. #225
  if (u.pathname.includes('/cdn-cgi/image/')) {
    const after = u.pathname.split('/cdn-cgi/image/')[1] ?? '';
    const slash = after.indexOf('/');
    const opts = slash > 0 ? after.slice(0, slash) : '';
    if (slash > 0 && opts.includes('=')) {
      const decoded = safeDecode(after.slice(slash + 1)) + (u.search || '');
      try {
        const abs = /^https?:\/\//i.test(decoded) ? decoded : new URL(decoded, u.origin).href;
        if (looksLikeMediaUrl(abs)) return abs;
      } catch {
        /* fall through */
      }
    }
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

  // A URL whose OWN path is already a media file (…/photo.jpg) is a real asset that
  // merely carries a ?src=/?url= tracking param — not a proxy. Unwrapping it would
  // swap the real image for whatever the param points at, so skip the generic pass.
  // Real proxy endpoints (Cloudinary/weserv handled above, Next.js /_next/image)
  // have extension-less paths and still fall through.
  if (MEDIA_EXT.test(u.pathname)) return null;

  // Next.js /_next/image and any generic ?url=/?src=/... param.
  for (const key of PROXY_PARAMS) {
    const raw = u.searchParams.get(key);
    if (!raw) continue;
    const decoded = safeDecode(raw);
    let abs: string | null = null;
    if (/^https?:\/\//i.test(decoded)) {
      abs = decoded;
    } else if (decoded.startsWith('/')) {
      // Same-origin relative inner path (Next.js `?url=%2Fassets%2Fhero.jpg`):
      // resolve against the proxy host's origin to reach the real asset.
      try { abs = new URL(decoded, u.origin).href; } catch { abs = null; }
    }
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
const WxH = /(?<![\dA-Za-z])(\d{2,5})x(\d{2,5})(?![\dA-Za-z])/i;

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

/** Decodes a base64url segment to a UTF-8 string; null on failure. */
function decodeB64Url(seg: string): string | null {
  try {
    let s = seg.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad) s += '='.repeat(4 - pad);
    return atob(s);
  } catch {
    return null;
  }
}

/**
 * The per-image max dimensions embedded in a DeviantArt (wixmp) signed token.
 * The JWT payload is `[[{ width: "<=1920", height: "<=1080", ... }]]`; requesting
 * a larger size than this cap 403s, so the cap is read rather than guessed.
 * Returns null when the token can't be parsed.
 */
function wixmpTokenCap(token: string): { w: number; h: number } | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  const json = decodeB64Url(payload);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Array<Array<{ width?: unknown; height?: unknown }>>;
    const dim = parsed?.[0]?.[0];
    const w = parseInt(String(dim?.width ?? '').replace(/\D/g, ''), 10);
    const h = parseInt(String(dim?.height ?? '').replace(/\D/g, ''), 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w, h };
  } catch {
    return null;
  }
}

/** Cloudinary transformation param keys (resize/crop/quality/format/effect/…). */
const CLOUDINARY_KEYS = new Set([
  'w', 'h', 'c', 'q', 'e', 'g', 'x', 'y', 'r', 'o', 'a', 'b', 'co', 'dpr', 'fl',
  'ar', 'z', 'l', 'u', 't', 'f', 'd', 'p', 'cs', 'vc', 'bo', 'br', 'ac', 'so',
  'eo', 'du', 'fps', 'ki', 'sp', 'if', 'pg', 'vs', 'dn', 'dl',
]);

/**
 * A Cloudinary transformation segment: a comma-list of `<key>_<value>` params
 * whose keys are all real transform keys and whose values carry no `_`. A
 * public-id folder (mac_photos, q_and_a) fails this test, so it is never
 * mistaken for a transform and stripped (which would 404).
 */
function isCloudinaryTransform(seg: string): boolean {
  return seg.split(',').every((t) => {
    const i = t.indexOf('_');
    return i > 0 && CLOUDINARY_KEYS.has(t.slice(0, i)) && !t.slice(i + 1).includes('_');
  });
}

// IIIF Image API canonical URL tail: /{region}/{size}/{rotation}/{quality}.{format}
// (https://iiif.io/api/image/). Matching the tail *shape* alone is too loose — a
// plain path like /2020/03/15/default.jpg would look like it — so region and size
// are each validated against the IIIF grammar. Only then is it an IIIF URL.
const IIIF_TAIL =
  /\/([^/]+)\/([^/]+)\/(!?\d+(?:\.\d+)?)\/(default|color|gray|bitonal)\.(jpe?g|tiff?|png|gif|jp2|pdf|webp)$/i;
/** region: full | square | x,y,w,h | pct:x,y,w,h */
const IIIF_REGION = /^(?:full|square|\d+,\d+,\d+,\d+|pct:[\d.]+,[\d.]+,[\d.]+,[\d.]+)$/i;
// size: full | max | pct:n | w, | ,h | w,h | !w,h. The 3.x `^` upscale prefix is
// deliberately unhandled — it percent-encodes to `%5E` in a real URL path, so an
// upscale request simply fails this test and passes through unchanged (safe: we
// only ever downscale a size to `full`, never synthesize an upscale).
const IIIF_SIZE = /^(?:full|max|pct:\d+(?:\.\d+)?|!?(?:\d+,\d*|,\d+))$/i;

/** Returns the IIIF tail match iff region+size are valid IIIF tokens; else null. */
function iiifTail(pathname: string): RegExpExecArray | null {
  const m = IIIF_TAIL.exec(pathname);
  if (!m || !IIIF_REGION.test(m[1]) || !IIIF_SIZE.test(m[2])) return null;
  return m;
}

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
    // Unsplash (images + plus) + Imgix: query-param resizers. images.rawpixel.com
    // is an imgix *vanity* host (it does NOT end in .imgix.net, so the .imgix.net
    // test misses it) serving CC0/public-domain masters — stripping the resize
    // params reaches the origin. See #224.
    match: (u) =>
      /(?:^|\.)(?:images|plus)\.unsplash\.com$/.test(u.hostname) ||
      /\.imgix\.net$/.test(u.hostname) ||
      u.hostname === 'images.rawpixel.com',
    rewrite: (u) => dropParams(u, RESIZE_PARAMS),
  },
  // ── Tier-2 strip-transform CDN family (#225) ──────────────────────────────
  // A family of transform engines that all share one shape: strip the resize
  // transform → the stored origin master (dimensions are encoded in the path or
  // filename, so the master is reconstructable). These engines UPSCALE past the
  // source on over-request, so the widest openly-served rendition is the stripped
  // master, not a giant ?w=. For the param-strip hosts, dropParams removes only
  // the named transform keys, so any delivery signature the URL carries is left
  // intact (never forged, never broken); ImageKit strips a path segment instead,
  // so it explicitly bails on a signed (ik-s=) URL. Cloudflare /cdn-cgi/image/ is
  // a path-embedded proxy handled in deproxy() above.
  {
    // Sanity (cdn.sanity.io): imgix-family query resizer; native dims live in the
    // filename (…-2218x1479.jpg), so stripping the transform reaches the master.
    match: (u) => u.hostname === 'cdn.sanity.io',
    rewrite: (u) => dropParams(u, [...RESIZE_PARAMS, 'fm', 'auto', 'rect', 'flip', 'or', 'sat', 'bg']),
  },
  {
    // Contentful (images.ctfassets.net): imgix-family query resizer. dropParams
    // touches only the transform keys, so a secure-delivery token survives.
    match: (u) => u.hostname === 'images.ctfassets.net',
    rewrite: (u) => dropParams(u, [...RESIZE_PARAMS, 'fm', 'f', 'r', 'bg']),
  },
  {
    // Sirv (*.sirv.com): ?w=&h=&scale.width=&scale.height=&q= dynamic resizer;
    // the bare path is the stored original.
    match: (u) => /(?:^|\.)sirv\.com$/i.test(u.hostname),
    rewrite: (u) =>
      dropParams(u, [...RESIZE_PARAMS, 'scale.width', 'scale.height', 'format', 'colorspace']),
  },
  {
    // Storyblok (*.storyblok.com): the image service appends a /m/<w>x<h>/
    // filters:…/ segment AFTER the filename; native dims are already in the path
    // (…/<WxH>/…). Strip everything from /m/ onward to reach the master.
    match: (u) => /(?:^|\.)storyblok\.com$/i.test(u.hostname) && u.pathname.includes('/m/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/m\/.*$/i, '');
    },
  },
  {
    // Uploadcare (ucarecdn.com): /<uuid>/-/<operation>/…/ transform segments;
    // strip the -/…/ operations back to the bare-UUID original.
    match: (u) => u.hostname === 'ucarecdn.com' && u.pathname.includes('/-/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/-\/.*$/i, '/');
    },
  },
  {
    // ImageKit (ik.imagekit.io): resize via a ?tr= query or a /tr:<ops>/ path
    // segment. Strip both to the original. A signed URL (ik-s=) can't be re-signed
    // after a path edit, so it is left untouched (match bails).
    match: (u) => u.hostname === 'ik.imagekit.io' && !u.searchParams.has('ik-s'),
    rewrite: (u) => {
      u.searchParams.delete('tr');
      u.pathname = u.pathname.replace(/\/tr:[^/]+\//i, '/');
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // ── Tier-3 content / museum / retail (#225 → #226) ────────────────────────
  {
    // The Met (images.metmuseum.org): the CRDImages path carries a size folder
    // (web-large, mobile-large, …). Swap web-large -> original for the full CC0
    // master. Verified 272 KB -> 8.3 MB. See #226.
    match: (u) => u.hostname === 'images.metmuseum.org',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/web-large\//, '/original/');
    },
  },
  {
    // NASA image library (images-assets.nasa.gov): /<id>/<id>~<size>.<ext> where
    // <size> is thumb/small/medium/orig. Swap to ~orig for the public-domain
    // master. Verified 176 KB -> 1.4 MB. See #226.
    match: (u) => u.hostname === 'images-assets.nasa.gov',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/~(?:thumb|small|medium)(?=\.[a-z0-9]+$)/i, '~orig');
    },
  },
  {
    // National Geographic (i.natgeofe.com): ?w=&h= dynamic resizer; the bare path
    // is the in-page master (no watermark/paywall). Verified 17 KB -> 546 KB. #226
    match: (u) => u.hostname === 'i.natgeofe.com',
    rewrite: (u) => dropParams(u, ['w', 'h']),
  },
  {
    // Nike (static.nike.com): custom-domain Cloudinary at /a/images/<transform>/
    // <hash>/<file>. The res.cloudinary.com rule below does NOT match this host,
    // so Nike gets its own: replace the leading transform segment with
    // w_2000,c_limit,f_auto (c_limit clamps at source — never upscales). Guarded
    // by isCloudinaryTransform so a URL that is already the bare original (no
    // transform segment) is left untouched. Verified 1 KB -> 485 KB. See #226.
    match: (u) => u.hostname === 'static.nike.com' && u.pathname.startsWith('/a/images/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\/a\/images\/)([^/]+)(\/)/, (whole, pre, seg, post) =>
        isCloudinaryTransform(seg) ? `${pre}w_2000,c_limit,f_auto${post}` : whole);
    },
  },
  {
    // adidas (assets.adidas.com, brand.assets.adidas.com): custom-domain
    // Cloudinary with a w_<N> width param. Raise it to w_1920 (adidas clamps via
    // if_w_gt_1920, so 1920 never upscales past source); only RAISE — a larger
    // requested width is left as-is, never downgraded. See #226.
    match: (u) => /(?:^|\.)assets\.adidas\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(^|[/,])w_(\d+)(?=[,/])/gi, (m, pre, n) =>
        parseInt(n, 10) < 1920 ? `${pre}w_1920` : m);
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // ── Tier-4 free-tier stock / icons / wallpaper (#227) ─────────────────────
  // All four live-verified (byte size + watermark check); vecteezy (Pro previews
  // are watermarked, indistinguishable by host/path) and svgrepo (/show/ is
  // already the vector original) were verified and REJECTED. alphacoders and
  // wallpaperflare are aggregators of third-party content — the rewrite is a
  // valid size upgrade, but redistribution is the user's responsibility.
  {
    // Flaticon (cdn-icons-png.flaticon.com): the first path segment is the icon
    // size (/128/25/25231.png). Raise it to 512, the free-PNG ceiling (larger
    // sizes/SVG need an account and live on other hosts). Only raise. Verified
    // 128px=2.7 KB -> 512px=8.6 KB. See #227.
    match: (u) => u.hostname === 'cdn-icons-png.flaticon.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/^\/(\d+)\//, (m, n) => (parseInt(n, 10) < 512 ? '/512/' : m));
    },
  },
  {
    // pxhere (c.pxhere.com): a trailing `!<token>` on the /photos/ path selects a
    // rendition (!s/!s1/!c/!f = smaller); `!d` is the site's Download-Original.
    // Set the token to !d. The bare `.jpg` with NO token returns 403, so this
    // always SETS !d rather than stripping. CC0. Verified !s1=69 KB -> !d=401 KB.
    match: (u) => u.hostname === 'c.pxhere.com' && u.pathname.startsWith('/photos/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\.(?:jpe?g|png|gif))(?:![a-z0-9]+)?$/i, '$1!d');
    },
  },
  {
    // AlphaCoders (images<N>.alphacoders.com): the wallpaper thumbnail is a
    // `thumb-<N>-<id>.<ext>` filename; strip the `thumb-<N>-` prefix for the
    // full-resolution original. Verified 24 KB -> 1.3 MB. See #227.
    match: (u) => /^images\d+\.alphacoders\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/thumb-\d+-(\d+\.(?:jpe?g|png|webp))$/i, '/$1');
    },
  },
  {
    // WallpaperFlare (c<N>.wallpaperflare.com): the preview image filename ends
    // `-thumbnail.<ext>`; strip that suffix for the larger rendition. The
    // `/preview/` PATH segment must be kept (dropping it 404s). Verified
    // 19 KB -> 126 KB. See #227.
    match: (u) => /^c\d+\.wallpaperflare\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/-thumbnail(\.(?:jpe?g|png|webp))$/i, '$1');
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  {
    // Cloudinary: strip the leading transformation segment(s) right after
    // /upload/. A transform segment is a comma-list of `<key>_<value>` params
    // (w_300,h_200,c_fill,…); a public-id folder that merely contains w_/h_/c_/q_
    // as a substring (mac_photos, q_and_a, new_w_series) is NOT one — the old
    // substring rule stripped those and returned a 404. Each comma-token is
    // validated against Cloudinary's transform keys (value carrying no `_`)
    // before the segment is dropped. Chained transforms (/w_300/e_blur/) are all
    // stripped; the version (v123…) and public-id/folder segments are kept.
    match: (u) => u.hostname === 'res.cloudinary.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/upload\/((?:[^/]+\/)+)/, (whole: string, segs: string) => {
        const parts = segs.split('/').filter(Boolean);
        let i = 0;
        while (i < parts.length && isCloudinaryTransform(parts[i])) i++;
        return i === 0 ? whole : `/upload/${parts.slice(i).map((p) => `${p}/`).join('')}`;
      });
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
    // IIIF Image API — a spec, not a host (like the MediaWiki /thumb/ rule above).
    // The canonical URL ends /{region}/{size}/{rotation}/{quality}.{format}; the
    // {size} segment carries the rendition width, so rewrite it to `full` (the
    // 2.x max, also honored by most 3.x servers) and every size variant of one
    // image collapses to a single origin URL. region/rotation/quality/format are
    // preserved untouched. A size already at its largest (`full`/`max`, incl. the
    // 3.x `^` upscale prefix) is left as-is — nothing to upgrade. This single rule
    // covers Met, Library of Congress, Rijksmuseum, Smithsonian, Harvard, Yale,
    // Vatican and most open-access library/museum programs. See #224.
    match: (u) => iiifTail(u.pathname) !== null,
    rewrite: (u) => {
      const m = iiifTail(u.pathname);
      if (!m) return;
      const [, region, size, rot, quality, ext] = m;
      if (/^(?:full|max)$/i.test(size)) return; // already the largest rendition
      u.pathname = u.pathname.slice(0, m.index) + `/${region}/full/${rot}/${quality}.${ext}`;
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
    // Pinterest: /<NNNx>/, /<NNNxNNN>/, or a responsive smart-crop /<NNNxNNN>_RS/
    // size folder -> /originals/. The `_RS` variants (30x30_RS, 75x75_RS,
    // 280x280_RS, …) are square-cropped thumbnails Pinterest serves for board
    // covers and avatars; they share the same hash path as the full image, so
    // /originals/ resolves for them too (verified against a real board). Without
    // the `_RS` branch these passed through un-upgraded — the user got a tiny crop.
    match: (u) => u.hostname === 'i.pinimg.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/^\/\d+x(?:\d+)?(?:_RS)?\//, '/originals/');
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
    // NYT (static01.nyt.com): the filename size token before the extension maps
    // to a crop. Swap the standard editorial photo crops (articleLarge,
    // articleInline, mediumThreeByTwoNNN) — which always have a -superJumbo
    // sibling — up to -superJumbo, and always drop the ?quality/&auto query
    // (that alone raises quality on any crop). Non-editorial tokens (logos,
    // podcast art) may lack superJumbo, so they are left as-is bar the query
    // drop. See #84.
    match: (u) => u.hostname === 'static01.nyt.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /-(?:articleLarge|articleInline|mediumThreeByTwo\d+)(\.[a-z0-9]+)$/i,
        '-superJumbo$1',
      );
      u.search = '';
    },
  },
  {
    // imgur (i.imgur.com): a single suffix letter (s,b,t,m,l,h,r,g) turns a
    // 7-char id into an 8-char thumbnail (<id><suffix>.ext); the bare <id>.ext is
    // the original. Strip the suffix ONLY when the basename is exactly 8 chars and
    // ends in a known thumb letter. A real 7-char id carries no suffix, and
    // blindly stripping one would resolve to a DIFFERENT image (not a 404), so the
    // length gate is essential. Suffix letters are lowercase (no /i flag). See #83.
    match: (u) => u.hostname === 'i.imgur.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/^\/([A-Za-z0-9]{7})[sbtmlhrg](\.[a-z0-9]+)$/, '/$1$2');
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
    // DeviantArt (images-wixmp-*.wixmp.com): images carry a /v1/(fit|fill)/w_,h_,
    // q_,strp/ transform and a signed ?token=<JWT>. Upgrade to the token's
    // per-image cap (read from the JWT payload) as /v1/fill/ at q_100, keeping the
    // same token. Exceeding the cap 403s and dropping the token 401s, so the cap
    // is parsed and never guessed: if the token or cap can't be read, the URL is
    // left unchanged. See #101.
    match: (u) => /(?:^|\.)wixmp\.com$/i.test(u.hostname) && /\/v1\/(?:fit|fill)\//.test(u.pathname),
    rewrite: (u) => {
      const token = u.searchParams.get('token');
      if (!token) return;
      const cap = wixmpTokenCap(token);
      if (!cap) return;
      u.pathname = u.pathname.replace(
        /\/v1\/(?:fit|fill)\/[^/]+\/([^/]+)$/,
        `/v1/fill/w_${cap.w},h_${cap.h},q_100,strp/$1`,
      );
    },
  },
  {
    // Zillow (photos.zillowstatic.com): the last -<token> before the extension is
    // the size (p_e, cc_ft_960, o_a, ...). Swap it to the largest aspect-
    // preserving preset, uncropped_scaled_within_1536_1152 (served as webp; larger
    // uncropped presets 404, cc_ft_* is crop-to-width). See #106.
    match: (u) => u.hostname === 'photos.zillowstatic.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /-[a-z0-9_]+\.(?:webp|jpe?g|png)$/i,
        '-uncropped_scaled_within_1536_1152.webp',
      );
      u.search = '';
    },
  },
  {
    // StockSnap (cdn.stocksnap.io): pre-generated sizes under /img-thumbs/<token>/.
    // Swap the token to 960w, the largest available. The tokens are a hard
    // whitelist (every other size 404s), so 960w is targeted specifically. See #105.
    match: (u) => u.hostname === 'cdn.stocksnap.io' && u.pathname.includes('/img-thumbs/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/img-thumbs\/[^/]+\//, '/img-thumbs/960w/');
    },
  },
  {
    // IKEA (www.ikea.com/images/...): serves resized images via ?f=<size> or
    // ?imwidth=<N>. imwidth reaches a larger master than the f ladder (f caps
    // ~58 KB, imwidth=2000 ~102 KB), so strip the query and request imwidth=2000.
    // Native-capped: oversizing clamps to the master. See #100.
    match: (u) => u.hostname === 'www.ikea.com' && u.pathname.startsWith('/images/'),
    rewrite: (u) => { u.search = ''; u.searchParams.set('imwidth', '2000'); },
  },
  {
    // Newegg (c1.neweggimages.com): a size-token folder (nobgproductcompressall
    // <N>, productimagecompressall<N>) sets the rendition width. Bump it to 1280,
    // the max valid token (1800/2000 -> 404; /productimageoriginal/ is smaller and
    // non-bg-removed, so not preferred). See #99.
    match: (u) => u.hostname === 'c1.neweggimages.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /\/((?:nobgproduct|productimage)compressall)\d+\//,
        (_m, token) => `/${token}1280/`,
      );
    },
  },
  {
    // Temu (img.kwcdn.com): product images carry a Qiniu `imageView2` transform in
    // the query (?imageView2/2/w/800/q/70/format/webp) that downsizes + reformats.
    // Dropping it returns the stored original. Scoped to `imageView2` so a
    // signed/plain kwcdn URL is left untouched. Sample-based — temu.com is
    // captcha-gated, so this was not live-injected. See #141.
    match: (u) => u.hostname === 'img.kwcdn.com' && /imageView2/i.test(u.search),
    rewrite: (u) => { u.search = ''; },
  },
  {
    // Squarespace image CDN (images.squarespace-cdn.com): ?format=<N>w renders a
    // width variant off a fixed ladder that tops out at 2500w, served by every
    // image and clamped to the source when the source is smaller. Force 2500w for
    // the largest served rendition. `format=original` is account-toggleable and
    // often just returns the same 2500w, so the ladder max is targeted instead.
    // Verified 100w=3 KB -> 2500w=1.18 MB.
    match: (u) => u.hostname === 'images.squarespace-cdn.com',
    rewrite: (u) => { u.searchParams.set('format', '2500w'); },
  },
  {
    // Wix (static.wixstatic.com): the uploaded original lives at
    // /media/<id>~mv2.<ext>; a displayed thumbnail appends a
    // /v1/<transform>/w_..,h_..,.../<filename> render segment. The base media
    // file is the source regardless of the transform kind, so strip everything
    // from /v1/ onward. Verified base=200 (70 KB original).
    match: (u) => u.hostname === 'static.wixstatic.com' && /\/media\/[^/]+\/v1\//.test(u.pathname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\/media\/[^/]+)\/v1\/.*$/i, '$1');
    },
  },
  {
    // Bluesky (cdn.bsky.app): feed images serve a downscaled /feed_thumbnail/
    // rendition and a larger /feed_fullsize/ one from the same DID/CID path. Swap
    // thumbnail -> fullsize (the largest publicly served variant). Verified
    // thumb=90 KB -> fullsize=201 KB.
    match: (u) => u.hostname === 'cdn.bsky.app' && u.pathname.includes('/feed_thumbnail/'),
    rewrite: (u) => { u.pathname = u.pathname.replace('/feed_thumbnail/', '/feed_fullsize/'); },
  },
  {
    // Bandcamp (f4.bcbits.com): album/track art is /img/a<id>_<code>.<ext> where
    // the trailing _<code> is a size preset and _0 is the full-resolution JPEG
    // original. Swap any numeric size code to _0. Scoped to the a<digits> art
    // prefix — band/bio images use other prefixes without a guaranteed _0.
    // Verified _10=335 KB -> _0=1.33 MB.
    match: (u) => u.hostname === 'f4.bcbits.com' && /\/img\/a\d+_\d+\.[a-z0-9]+$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/(\/img\/a\d+)_\d+(\.[a-z0-9]+)$/i, '$1_0$2'); },
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

  // Guard: a rewrite must not empty or collapse the path to root. A directory-
  // style original (…/<uuid>/ for Uploadcare) is legitimate, so the test is for a
  // surviving non-empty segment rather than a trailing filename.
  if (!parsed.pathname || parsed.pathname.split('/').filter(Boolean).length === 0) {
    return { original: url };
  }

  const rewritten = parsed.href;
  if (rewritten === url && parsed.pathname === before) return { original: url };
  return { original: rewritten, thumbnail: url };
}
