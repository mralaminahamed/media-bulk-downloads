/**
 * Canonical src identity — one system for recognizing the SAME media across the
 * volatile URLs a CDN serves it under (rotating edge hosts, signed query tokens,
 * cache-busters, resize transforms). Used everywhere media is compared or
 * deduped: collection dedup, the "already downloaded" mark, favourites, and the
 * excluded blocklist. It is NEVER used to build a download URL — only to key
 * membership; the full original src is always what gets downloaded.
 *
 * Extend it by adding a rule to SRC_KEY_RULES (host match → canonical key),
 * mirroring the CDN-upgrade RULES engine in imageUrl.ts.
 */

import { isCloudinaryTransform } from '@mbd/core/collection/imageUrl';

/** A per-CDN canonical-key rule: match a URL, then reduce it to a stable key. */
export interface SrcKeyRule {
  /** Does this rule own the URL? */
  match: (u: URL) => boolean;
  /** The stable identity key (host + path, minus volatile parts). */
  key: (u: URL) => string;
}

const SANKAKU_HOST = /(?:^|\.)sankakucomplex\.com$/i;
const SANKAKU_MEDIA =
  /\/data\/(?:preview\/|sample\/)?(?:[0-9a-f]{2}\/)*([0-9a-f]{32})\.(?:avif|jpe?g|png|gif|webp)$/i;

const XHS_HOST = /(?:^|\.)(?:xhscdn|rednotecdn)\.com$/i;
const XHS_SIGNED_PREFIX = /^\/\d{6,}\/[0-9a-f]{32}\//i;

export const SRC_KEY_RULES: SrcKeyRule[] = [
  {
    match: (u) => /(?:^|\.)(?:fbcdn\.net|cdninstagram\.com)$/i.test(u.hostname),
    key: (u) => `fbcdn.net${u.pathname}`,
  },
  {
    match: (u) => /^i[0-2]\.wp\.com$/i.test(u.hostname),
    key: (u) => `i.wp.com${u.pathname}`,
  },
  {
    match: (u) => /(?:^|\.)googleusercontent\.com$/i.test(u.hostname),
    key: (u) => `${u.hostname.toLowerCase()}${u.pathname.replace(/=[^/=]*$/, '')}`,
  },
  {
    match: (u) => /(?:^|\.)imgix\.net$/i.test(u.hostname),
    key: (u) => {
      const q = new URLSearchParams(u.search);
      const base = `${u.hostname.toLowerCase()}${u.pathname}`;
      const ids = ['frame', 'page'].filter((k) => q.has(k)).map((k) => `${k}=${q.get(k)}`);
      return ids.length ? `${base}?${ids.join('&')}` : base;
    },
  },
  {
    match: (u) => /(?:^|\.)res\.cloudinary\.com$/i.test(u.hostname),
    key: (u) => {
      const stripped = u.pathname
        // transform segment: one or more comma-joined key_value tokens (e.g.
        // w_400, or w_800,c_fill), validated by isCloudinaryTransform.
        .replace(/\/(image|video|raw)\/(upload|fetch)\/([^/]+)\//, (whole, kind, mode, seg) =>
          isCloudinaryTransform(seg) ? `/${kind}/${mode}/` : whole)
        // Cloudinary auto-version: v + exactly 10-digit epoch, only right after upload/fetch.
        // A hand-named /v2/ folder or a 7-9 digit order-id/SKU folder is left intact.
        .replace(/\/(upload|fetch)\/v\d{10}\//, '/$1/');
      return `res.cloudinary.com${stripped}`;
    },
  },
  {
    match: (u) => /(?:^|\.)twimg\.com$/i.test(u.hostname),
    key: (u) => `${u.hostname.toLowerCase()}${u.pathname.replace(/:(?:thumb|small|medium|large|orig)$/i, '')}`,
  },
  {
    match: (u) => u.hostname === 'i.pinimg.com',
    key: (u) => `i.pinimg.com${u.pathname.replace(/^\/(?:\d+x(?:\d+)?(?:_RS)?|originals)\//, '/')}`,
  },
  {
    match: (u) => SANKAKU_HOST.test(u.hostname) && SANKAKU_MEDIA.test(u.pathname),
    key: (u) => `sankakucomplex.com/data/${u.pathname.match(SANKAKU_MEDIA)![1].toLowerCase()}`,
  },
  {
    match: (u) => XHS_HOST.test(u.hostname) && XHS_SIGNED_PREFIX.test(u.pathname),
    key: (u) => `xhscdn.com${u.pathname.replace(XHS_SIGNED_PREFIX, '/').replace(/![^/]*$/, '')}`,
  },
];

/**
 * Real media file extensions. When a path ends in one, the path IS the identity,
 * so the whole query (CDN transforms, signatures, cache-busters) is dropped. A
 * path ending in a NON-media extension (`.php`, `.aspx`, `.ashx`, …) is a dynamic
 * endpoint whose identity lives in the query, so it is treated like an
 * extension-less path — otherwise two distinct images served by one script
 * (`attachment.php?id=1` vs `?id=2`) would collapse to a single key.
 */
const MEDIA_EXT = /\.(?:jpe?g|png|gif|webp|avif|bmp|ico|svgz?|tiff?|hei[cf]|jfif|jxl|jp2|mp4|webm|mov|m4v|mkv|avi|m3u8|mpd|mp3|m4a|aac|ogg|ogv|opus|oga|wav|flac)$/i;

/**
 * Query params that are transport noise, not identity — dropped from a dynamic
 * path's key so a rotating cache-buster / per-request token can't defeat dedup or
 * the exclude blocklist. Identity-bearing params (`id`, `attachmentid`, …) survive.
 */
const VOLATILE_PARAMS = new Set([
  'cb', 'cache', 'nocache', 'bust', 'cachebust', '_', 't', 'ts', 'time', 'timestamp',
  'v', 'ver', 'version', 'rand', 'random', 'r', 'sig', 'signature', 'token', 'expires', 'exp', 'nonce',
]);

/**
 * Query params that only pick a SIZE/FORMAT rendition of the same underlying
 * image (not a different image). Stripped from a dynamic path's key so the same
 * source excluded/deduped at one size stays matched at every other size — the
 * universal equivalent of the fbcdn rule, for any host. e.g. Gravatar
 * `…/avatar/<hash>?s=52` and `?s=96` collapse to one identity. Kept deliberately
 * narrow (unambiguous dimensioning) so two genuinely different images sharing a
 * dynamic endpoint are never merged.
 */
const TRANSFORM_PARAMS = new Set([
  'w', 'h', 'width', 'height', 's', 'size', 'q', 'quality', 'dpr', 'fit',
  'resize', 'scale', 'zoom', 'fm', 'format', 'auto',
]);

/**
 * The canonical identity key for a media src. A matching SRC_KEY_RULE decides;
 * otherwise: a real media-file path drops its whole query (identity is the path);
 * a dynamic (`.php` / extension-less) path keeps its query but with volatile
 * transport params AND size/format transform params stripped, since identity
 * lives in the remaining params. Never throws; returns the raw src when
 * unparseable.
 */
export function canonicalSrcKey(src: string): string {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return src;
  }
  const rule = SRC_KEY_RULES.find((r) => r.match(u));
  if (rule) return rule.key(u);
  const host = u.hostname.toLowerCase();
  if (MEDIA_EXT.test(u.pathname)) return `${host}${u.pathname}`;
  const params = new URLSearchParams(u.search);
  for (const k of [...params.keys()]) {
    const lk = k.toLowerCase();
    if (VOLATILE_PARAMS.has(lk) || TRANSFORM_PARAMS.has(lk)) params.delete(k);
  }
  params.sort();
  const q = params.toString();
  return q ? `${host}${u.pathname}?${q}` : `${host}${u.pathname}`;
}

/**
 * A membership set keyed by canonical src identity: `has`/`withAdded`/`withoutSrc`
 * all canonicalize their argument, so callers pass raw srcs and never touch
 * canonicalSrcKey themselves. Immutable ops (`withAdded`/`withoutSrc` return a new
 * set) suit React state. This is the reusable primitive for every src-match set.
 */
export class SrcKeySet {
  private readonly keys: Set<string>;

  constructor(keys: Set<string> = new Set()) {
    this.keys = keys;
  }

  /** Build from raw srcs (each canonicalized). */
  static from(srcs: Iterable<string>): SrcKeySet {
    const keys = new Set<string>();
    for (const s of srcs) keys.add(canonicalSrcKey(s));
    return new SrcKeySet(keys);
  }

  /** Is a src (any of its CDN variants) in the set? */
  has(src: string): boolean {
    return this.keys.has(canonicalSrcKey(src));
  }

  /** A copy with `src`'s canonical key added. */
  withAdded(src: string): SrcKeySet {
    const next = new Set(this.keys);
    next.add(canonicalSrcKey(src));
    return new SrcKeySet(next);
  }

  /** A copy with `src`'s canonical key removed. */
  withoutSrc(src: string): SrcKeySet {
    const next = new Set(this.keys);
    next.delete(canonicalSrcKey(src));
    return new SrcKeySet(next);
  }

  get size(): number {
    return this.keys.size;
  }
}
