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
    while (i < n && (isWs(s[i]) || s[i] === ',')) i++;
    if (i >= n) break;
    const urlStart = i;
    while (i < n && !isWs(s[i])) i++;
    let url = s.slice(urlStart, i);
    let hadTrailingComma = false;
    while (url.endsWith(',')) { url = url.slice(0, -1); hadTrailingComma = true; }
    if (!url) continue;
    if (hadTrailingComma) { out.push(url); continue; }
    while (i < n && isWs(s[i])) i++;
    const descStart = i;
    while (i < n && s[i] !== ',') i++;
    const desc = s.slice(descStart, i).trim();
    out.push(desc ? `${url} ${desc}` : url);
    if (i < n && s[i] === ',') i++;
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

  if (/\/image\/fetch\//.test(u.pathname)) {
    const after = u.pathname.split('/image/fetch/')[1] ?? '';
    const inner = after.replace(/^(?:[^/]*_[^/]*\/)+/, '');
    const decoded = safeDecode(inner) + (u.search || '');
    const abs = /^https?:\/\//i.test(decoded) ? decoded : null;
    if (abs && looksLikeMediaUrl(abs)) return abs;
  }

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

  if (/(?:^|\.)(?:images\.weserv\.nl|wsrv\.nl)$/i.test(u.hostname)) {
    const raw = u.searchParams.get('url');
    if (raw) {
      const decoded = safeDecode(raw);
      const abs = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded}`;
      if (looksLikeMediaUrl(abs)) return abs;
    }
  }

  if (/\/proxy\/[^/]+$/.test(u.pathname)) {
    const raw = u.searchParams.get('url');
    if (raw) {
      const decoded = safeDecode(raw);
      if (/^https?:\/\//i.test(decoded) && looksLikeMediaUrl(decoded)) return decoded;
    }
  }
  if (u.hostname === 'proxy.misskeyusercontent.jp') {
    const m = u.pathname.match(/^\/(?:image|static|avatar|emoji)\/(.+)$/);
    if (m) {
      const decoded = safeDecode(m[1]);
      const abs = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded}`;
      if (looksLikeMediaUrl(abs)) return abs;
    }
  }

  if (MEDIA_EXT.test(u.pathname)) return null;

  for (const key of PROXY_PARAMS) {
    const raw = u.searchParams.get(key);
    if (!raw) continue;
    const decoded = safeDecode(raw);
    let abs: string | null = null;
    if (/^https?:\/\//i.test(decoded)) {
      abs = decoded;
    } else if (decoded.startsWith('/')) {
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

/** A `WxH` size token immediately preceded by a dimension separator (`_800x600`
 *  Shopify, `-800x600` generic filename, `name=360x480` query) — NOT a bare
 *  slash-delimited path segment like a date/id `/12x34/`, which would otherwise
 *  match and report a tiny spurious size that wrongly filters out a large image. */
const WxH = /(?<=[-_=])(\d{2,5})x(\d{2,5})(?![\dA-Za-z])/i;

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
export function isCloudinaryTransform(seg: string): boolean {
  return seg.split(',').every((t) => {
    const i = t.indexOf('_');
    return i > 0 && CLOUDINARY_KEYS.has(t.slice(0, i)) && !t.slice(i + 1).includes('_');
  });
}

const IIIF_TAIL =
  /\/([^/]+)\/([^/]+)\/(!?\d+(?:\.\d+)?)\/(default|color|gray|bitonal)\.(jpe?g|tiff?|png|gif|jp2|pdf|webp)$/i;
/** region: full | square | x,y,w,h | pct:x,y,w,h */
const IIIF_REGION = /^(?:full|square|\d+,\d+,\d+,\d+|pct:[\d.]+,[\d.]+,[\d.]+,[\d.]+)$/i;
const IIIF_SIZE = /^(?:full|max|pct:\d+(?:\.\d+)?|!?(?:\d+,\d*|,\d+))$/i;

/** Returns the IIIF tail match iff region+size are valid IIIF tokens; else null. */
function iiifTail(pathname: string): RegExpExecArray | null {
  const m = IIIF_TAIL.exec(pathname);
  if (!m || !IIIF_REGION.test(m[1]) || !IIIF_SIZE.test(m[2])) return null;
  return m;
}

const RULES: CdnRule[] = [
  {
    match: (u) => u.hostname === 'pbs.twimg.com',
    rewrite: (u) => {
      if (u.searchParams.has('name')) u.searchParams.set('name', 'orig');
    },
  },
  {
    match: (u) => /(^|\.)wp\.com$/.test(u.hostname) || /\.files\.wordpress\.com$/.test(u.hostname),
    rewrite: (u) => {
      dropParams(u, RESIZE_PARAMS);
      u.pathname = u.pathname.replace(/-scaled(?=\.[a-z0-9]+$)/i, '');
    },
  },
  {
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
    match: (u) =>
      /(?:^|\.)(?:images|plus)\.unsplash\.com$/.test(u.hostname) ||
      /\.imgix\.net$/.test(u.hostname) ||
      u.hostname === 'images.rawpixel.com',
    rewrite: (u) => dropParams(u, RESIZE_PARAMS),
  },
  {
    match: (u) => u.hostname === 'cdn.sanity.io',
    rewrite: (u) => dropParams(u, [...RESIZE_PARAMS, 'fm', 'auto', 'rect', 'flip', 'or', 'sat', 'bg']),
  },
  {
    match: (u) => u.hostname === 'images.ctfassets.net',
    rewrite: (u) => dropParams(u, [...RESIZE_PARAMS, 'fm', 'f', 'r', 'bg']),
  },
  {
    match: (u) => /(?:^|\.)sirv\.com$/i.test(u.hostname),
    rewrite: (u) =>
      dropParams(u, [...RESIZE_PARAMS, 'scale.width', 'scale.height', 'format', 'colorspace']),
  },
  {
    match: (u) => /(?:^|\.)storyblok\.com$/i.test(u.hostname) && u.pathname.includes('/m/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/m\/.*$/i, '');
    },
  },
  {
    match: (u) => u.hostname === 'ucarecdn.com' && u.pathname.includes('/-/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/-\/.*$/i, '/');
    },
  },
  {
    match: (u) => u.hostname === 'ik.imagekit.io' && !u.searchParams.has('ik-s'),
    rewrite: (u) => {
      u.searchParams.delete('tr');
      u.pathname = u.pathname.replace(/\/tr:[^/]+\//i, '/');
    },
  },
  {
    match: (u) => u.hostname === 'images.metmuseum.org',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/web-large\//, '/original/');
    },
  },
  {
    match: (u) => u.hostname === 'images-assets.nasa.gov',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/~(?:thumb|small|medium)(?=\.[a-z0-9]+$)/i, '~orig');
    },
  },
  {
    match: (u) => u.hostname === 'i.natgeofe.com',
    rewrite: (u) => dropParams(u, ['w', 'h']),
  },
  {
    match: (u) => u.hostname === 'static.nike.com' && u.pathname.startsWith('/a/images/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\/a\/images\/)([^/]+)(\/)/, (whole, pre, seg, post) =>
        isCloudinaryTransform(seg) ? `${pre}w_2000,c_limit,f_auto${post}` : whole);
    },
  },
  {
    match: (u) => /(?:^|\.)assets\.adidas\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(^|[/,])w_(\d+)(?=[,/])/gi, (m, pre, n) =>
        parseInt(n, 10) < 1920 ? `${pre}w_1920` : m);
    },
  },
  {
    match: (u) => u.hostname === 'cdn-icons-png.flaticon.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/^\/(\d+)\//, (m, n) => (parseInt(n, 10) < 512 ? '/512/' : m));
    },
  },
  {
    match: (u) => u.hostname === 'c.pxhere.com' && u.pathname.startsWith('/photos/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\.(?:jpe?g|png|gif))(?:![a-z0-9]+)?$/i, '$1!d');
    },
  },
  {
    match: (u) => /^images\d+\.alphacoders\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/thumb-\d+-(\d+\.(?:jpe?g|png|webp))$/i, '/$1');
    },
  },
  {
    match: (u) => /^c\d+\.wallpaperflare\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/-thumbnail(\.(?:jpe?g|png|webp))$/i, '$1');
    },
  },
  {
    match: (u) => u.hostname === 'ic.pics.livejournal.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\/\d+_)[^/]+(\.(?:jpe?g|png|gif|webp|bmp))$/i, '$1original$2');
    },
  },
  {
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
    match: (u) => u.pathname.includes('/thumb/') && /\/[^/]*px-[^/]+$/i.test(u.pathname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/thumb\//, '/').replace(/\/[^/]*px-[^/]+$/i, '');
    },
  },
  {
    match: (u) => iiifTail(u.pathname) !== null,
    rewrite: (u) => {
      const m = iiifTail(u.pathname);
      if (!m) return;
      const [, region, size, rot, quality, ext] = m;
      if (/^(?:full|max)$/i.test(size)) return;
      u.pathname = u.pathname.slice(0, m.index) + `/${region}/full/${rot}/${quality}.${ext}`;
    },
  },
  {
    match: (u) => /(?:^|\.)googleusercontent\.com$|(?:^|\.)ggpht\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/=(?:[swh]\d+|[a-z]\d+)(?:-[a-z0-9]+)*$/i, '=s0');
    },
  },
  {
    match: (u) => u.hostname === 'i.pinimg.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/^\/\d+x(?:\d+)?(?:_RS)?\//, '/originals/');
    },
  },
  {
    match: (u) => u.hostname === 'i.ytimg.com' || u.hostname === 'img.youtube.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\/vi\/[^/]+\/)(?:default|mqdefault|[0-3])\.jpg$/i, '$1hqdefault.jpg');
    },
  },
  {
    match: (u) => /(?:^|\.)(?:media-amazon\.com|ssl-images-amazon\.com)$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\._[^.]*_(?=\.[a-z0-9]+$)/i, '');
    },
  },
  {
    match: (u) => u.hostname === 'image.civitai.com',
    rewrite: (u) => {
      const parts = u.pathname.split('/');
      const i = parts.length - 2;
      if (i >= 1 && parts[i].includes('=') && !/(?:^|,)original=/.test(parts[i])) {
        parts[i] = 'original=true';
        u.pathname = parts.join('/');
      }
    },
  },
  {
    match: (u) => u.hostname === 'miro.medium.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/v2\/(?:(?:resize|fit|format|max|frame|crop)[^/]*\/)*/, '/');
    },
  },
  {
    match: (u) => u.hostname === 'images.pexels.com',
    rewrite: (u) => { u.search = ''; },
  },
  {
    match: (u) => u.hostname === 'cdn.pixabay.com',
    rewrite: (u) => { u.pathname = u.pathname.replace(/_\d{2,4}(?=\.[a-z0-9]+$)/i, '_1280'); },
  },
  {
    match: (u) => /(?:^|\.)staticflickr\.com$/i.test(u.hostname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/_[sqtmnwzc](?=\.[a-z0-9]+$)/i, '_b'); },
  },
  {
    match: (u) => u.hostname === 'ichef.bbci.co.uk',
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/(news|standard)\/\d{2,4}\//, '/$1/2048/'); },
  },
  {
    match: (u) => u.hostname === 'i.etsystatic.com',
    rewrite: (u) => { u.pathname = u.pathname.replace(/il_\d+x(?:\d+|N)/i, 'il_fullxfull'); },
  },
  {
    match: (u) => u.hostname === 'i.ebayimg.com',
    rewrite: (u) => { u.pathname = u.pathname.replace(/s-l\d+(?=\.[a-z0-9]+$)/i, 's-l1600'); },
  },
  {
    match: (u) => u.hostname === 'platform.theverge.com' && u.pathname.includes('/wp-content/uploads/'),
    rewrite: (u) => dropParams(u, [...RESIZE_PARAMS, 'strip', 'ssl']),
  },
  {
    match: (u) => /(?:^|\.)scene7\.com$/i.test(u.hostname),
    rewrite: (u) => {
      dropParams(u, ['hei', 'qlt', 'fmt', 'resMode', 'op_usm', 'fit']);
      u.searchParams.set('wid', '2000');
    },
  },
  {
    match: (u) => /^cdn[a-z]\.artstation\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /\/(?:micro_square|smaller_square|small_square|small|medium)\//,
        '/large/',
      );
    },
  },
  {
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
    match: (u) => u.hostname === 'i.imgur.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\.gifv$/i, '.mp4');
      u.pathname = u.pathname.replace(/^\/([A-Za-z0-9]{7})[sbtmlhrg](\.[a-z0-9]+)$/, '/$1$2');
    },
  },
  {
    match: (u) => /(?:^|\.)alicdn\.com$/i.test(u.hostname) || /(?:^|\.)aliexpress-media\.com$/i.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\.(?:jpe?g|png|webp|gif))_.*$/i, '$1');
    },
  },
  {
    match: (u) => u.hostname === 'cdn.dribbble.com',
    rewrite: (u) => { u.search = ''; },
  },
  {
    match: (u) => /(?:^|\.)walmartimages\.com$/i.test(u.hostname),
    rewrite: (u) => { u.search = ''; },
  },
  {
    match: (u) => u.hostname === 'art.ngfiles.com',
    rewrite: (u) => { u.search = ''; },
  },
  {
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
    match: (u) => u.hostname === 'cdn.stocksnap.io' && u.pathname.includes('/img-thumbs/'),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/\/img-thumbs\/[^/]+\//, '/img-thumbs/960w/');
    },
  },
  {
    match: (u) => u.hostname === 'www.ikea.com' && u.pathname.startsWith('/images/'),
    rewrite: (u) => { u.search = ''; u.searchParams.set('imwidth', '2000'); },
  },
  {
    match: (u) => u.hostname === 'c1.neweggimages.com',
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /\/((?:nobgproduct|productimage)compressall)\d+\//,
        (_m, token) => `/${token}1280/`,
      );
    },
  },
  {
    match: (u) => u.hostname === 'img.kwcdn.com' && /imageView2/i.test(u.search),
    rewrite: (u) => { u.search = ''; },
  },
  {
    match: (u) => u.hostname === 'images.squarespace-cdn.com',
    rewrite: (u) => { u.searchParams.set('format', '2500w'); },
  },
  {
    match: (u) => u.hostname === 'static.wixstatic.com' && /\/media\/[^/]+\/v1\//.test(u.pathname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/(\/media\/[^/]+)\/v1\/.*$/i, '$1');
    },
  },
  {
    match: (u) => u.hostname === 'cdn.bsky.app' && u.pathname.includes('/feed_thumbnail/'),
    rewrite: (u) => { u.pathname = u.pathname.replace('/feed_thumbnail/', '/feed_fullsize/'); },
  },
  {
    match: (u) => u.hostname === 'f4.bcbits.com' && /\/img\/a\d+_\d+\.[a-z0-9]+$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/(\/img\/a\d+)_\d+(\.[a-z0-9]+)$/i, '$1_0$2'); },
  },
  {
    match: (u) => /^media\d*\.giphy\.com$/.test(u.hostname),
    rewrite: (u) => {
      if (u.pathname.startsWith('/media/')) {
        u.pathname = u.pathname.replace(/\/[^/]+\.gif$/i, '/giphy.gif');
      }
    },
  },
  {
    match: (u) => /^media\d*\.tenor\.com$/.test(u.hostname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(
        /\/([A-Za-z0-9_-]{11})[A-Za-z0-9]{5}(\/[^/]+\.gif)$/i,
        '/$1AAAAC$2',
      );
    },
  },
  {
    match: (u) => u.hostname === 'burst.shopifycdn.com' && u.pathname.startsWith('/photos/'),
    rewrite: (u) => { u.search = ''; },
  },
  {
    // Steam UGC (community screenshots/artwork). The `/ugc/<id>/<hash>/` URL is
    // the unsigned source; the query is a pure server-side resize/letterbox
    // (`imw/imh/ima/impolicy/imcolor/letterbox/cache` — no signature), so dropping
    // it serves the full-quality original. Live-probed 2026-07-21.
    match: (u) => u.hostname === 'images.steamusercontent.com' && u.pathname.startsWith('/ugc/'),
    rewrite: (u) => dropParams(u, ['imw', 'imh', 'ima', 'impolicy', 'imcolor', 'letterbox', 'cache']),
  },
  {
    match: (u) => u.hostname === 'wallpapercave.com' && /^\/w\d+\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/^\/w\d+\//, '/wp/'); },
  },
  {
    match: (u) => u.hostname === 'wallpapers.com' && /^\/images\/(?:thumbnail|high)\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/^\/images\/(?:thumbnail|high)\//, '/images/hd/'); },
  },
  {
    match: (u) => u.hostname === 'wallpaperaccess.com' && /^\/thumb\/[\w-]+\.[a-z0-9]+$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/^\/thumb\//, '/full/'); },
  },
  {
    match: (u) => u.hostname === 'upload.wikimedia.org' && /\/thumb\//.test(u.pathname),
    rewrite: (u) => {
      u.pathname = u.pathname.replace(/^(\/wikipedia\/[^/]+)\/thumb\/(.+)\/[^/]+$/, '$1/$2');
    },
  },
  {
    match: (u) => /^(?:ww|wx)[1-4]\.sinaimg\.cn$/.test(u.hostname),
    rewrite: (u) => {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+\.[a-z0-9]+)$/i);
      if (m && m[1] !== 'large' && m[1] !== 'woriginal') u.pathname = `/large/${m[2]}`;
    },
  },
  {
    match: (u) =>
      /^i[0-9]\.hdslb\.com$/.test(u.hostname) || /(?:^|\.)biliimg\.com$/.test(u.hostname),
    rewrite: (u) => {
      const at = u.pathname.indexOf('@');
      if (at >= 0) u.pathname = u.pathname.slice(0, at);
    },
  },
  {
    match: (u) => /^thumbs\d+\.imgbox\.com$/.test(u.hostname) && /_t\.[a-z0-9]+$/i.test(u.pathname),
    rewrite: (u) => {
      u.hostname = u.hostname.replace(/^thumbs(\d+)\./, 'images$1.');
      u.pathname = u.pathname.replace(/_t(\.[a-z0-9]+)$/i, '_o$1');
    },
  },
  {
    match: (u) =>
      u.hostname === 'avatars.mds.yandex.net' &&
      /^\/get-[^/]+\/[^/]+\/[^/]+\/[^/]+/.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/[^/]+$/, '/orig'); },
  },
  {
    match: (u) =>
      u.hostname === 'static.toiimg.com' &&
      (/\bmsid-\d+/.test(u.pathname) || /\/photo\/\d+\.cms/.test(u.pathname)),
    rewrite: (u) => {
      const m = u.pathname.match(/msid-(\d+)/) ?? u.pathname.match(/\/photo\/(\d+)\.cms/);
      if (m) u.pathname = `/thumb/msid-${m[1]},width-20000,resizemode-4/${m[1]}.jpg`;
    },
  },
  {
    match: (u) => u.hostname === 'cdn.dsmcdn.com' && /\/mnresize\/\d+\/\d+\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/mnresize\/\d+\/\d+\//, '/'); },
  },
  {
    match: (u) => u.hostname === 'img.youm7.com' && /^\/(?:small|medium)\//i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/^\/(?:small|medium)\//i, '/large/'); },
  },
  {
    match: (u) =>
      /^s\d+(?:-[a-z0-9]+)?\.glbimg\.com$/.test(u.hostname) && /\/\d+x\d+\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/\d+x\d+\//, '/0x0/'); },
  },
  {
    match: (u) => u.hostname === 'i.ibb.co' && /\.(?:md|th)\.[a-z0-9]+$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/\.(?:md|th)(\.[a-z0-9]+)$/i, '$1'); },
  },
  {
    match: (u) => u.hostname === 'im.vsco.co',
    rewrite: (u) => dropParams(u, RESIZE_PARAMS),
  },
  {
    match: (u) => u.hostname === 'images.saatchiart.com' && /-\d+\.jpe?g$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/-\d+(\.jpe?g)$/i, '-8$1'); },
  },
  {
    match: (u) => /^s?webtoon-phinf\.pstatic\.net$/.test(u.hostname),
    rewrite: (u) => { u.searchParams.delete('type'); },
  },
  {
    match: (u) => /\/m\/_v2\/.*_thumb\.[a-z0-9]+$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/_thumb(\.[a-z0-9]+)$/i, '$1'); },
  },
  {
    match: (u) =>
      /\/pictrs\/image\//.test(u.pathname) &&
      (u.searchParams.has('thumbnail') || u.searchParams.has('format')),
    rewrite: (u) => { u.searchParams.delete('thumbnail'); u.searchParams.delete('format'); },
  },
  {
    match: (u) =>
      u.hostname.endsWith('.img.susercontent.com') &&
      /\/file\/[a-z0-9-]+(?:_tn|@resize_[^/?]+)$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/(?:_tn|@resize_[^/?]+)$/i, ''); },
  },
  {
    match: (u) =>
      /(?:^|\.)mlstatic\.com$/.test(u.hostname) &&
      /-(?:OO|O|V|W|AB|F)\.(?:webp|jpg)$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/-(?:OO|O|V|W|AB|F)\.(?:webp|jpg)$/i, '-F.jpg'); },
  },
  {
    match: (u) => u.hostname === 'images.tokopedia.net' && /\/img\/cache\/[^/]+\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/img\/cache\/[^/]+\//, '/img/'); },
  },
  {
    match: (u) =>
      u.hostname === 'productimages.hepsiburada.net' &&
      /\/s\/\d+\/[^/]+\/[^/]+\.[a-z0-9]+$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/(\/s\/\d+\/)[^/]+(\/)/, '$12000$2'); },
  },
  {
    match: (u) => u.hostname === 'img.leboncoin.fr' && u.searchParams.has('rule'),
    rewrite: (u) => { u.searchParams.set('rule', 'ad-large'); },
  },
  {
    match: (u) => u.hostname === 'images.meesho.com' && u.searchParams.has('width'),
    rewrite: (u) => { u.searchParams.set('width', '2000'); },
  },
  {
    match: (u) => u.hostname === 'imgproxy.domestika.org' && /^\/unsafe\/.+?\/plain\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/^\/unsafe\/.+?\/plain\//, '/unsafe/plain/'); },
  },
  {
    match: (u) => /^i\d+\.shbdn\.com$/.test(u.hostname) && /\/photos\/\d+\/\d+\/\d+\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/(\/photos\/\d+\/\d+\/\d+\/)(?:thmb_|x\d+_)?/, '$1x5_'); },
  },
  {
    match: (u) => u.hostname === 'img.wattpad.com' && /\/cover\/\d+-\d+-k\w+\.jpg$/i.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/(\/cover\/\d+)-\d+(-k\w+\.jpg)$/i, '$1-512$2'); },
  },
  {
    match: (u) =>
      (u.hostname === 'postfiles.pstatic.net' || u.hostname === 'mblogthumb-phinf.pstatic.net') &&
      /^w\d+$/.test(u.searchParams.get('type') ?? ''),
    rewrite: (u) => { u.searchParams.set('type', 'w3840'); },
  },
  {
    match: (u) => /^imglf\d+\.lf127\.net$/.test(u.hostname) && u.search !== '',
    rewrite: (u) => { u.search = ''; },
  },
  {
    match: (u) => u.hostname === 'image.nostr.build' && /\/(?:thumb|resp\/[^/]+)\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/(?:thumb|resp\/[^/]+)\//, '/'); },
  },
  {
    match: (u) => u.hostname === 'news24cobalt.24.co.za' && /^\/resources\/[^/]+\/format\/[a-zA-Z0-9]+\//.test(u.pathname),
    rewrite: (u) => { u.pathname = u.pathname.replace(/\/format\/[a-zA-Z0-9]+\//, '/'); },
  },
  {
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

  if (!parsed.pathname || parsed.pathname.split('/').filter(Boolean).length === 0) {
    return { original: url };
  }

  const rewritten = parsed.href;
  if (rewritten === url && parsed.pathname === before) return { original: url };
  return { original: rewritten, thumbnail: url };
}
