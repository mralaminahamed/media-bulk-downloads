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

/** A per-CDN canonical-key rule: match a URL, then reduce it to a stable key. */
export interface SrcKeyRule {
  /** Does this rule own the URL? */
  match: (u: URL) => boolean;
  /** The stable identity key (host + path, minus volatile parts). */
  key: (u: URL) => string;
}

export const SRC_KEY_RULES: SrcKeyRule[] = [
  {
    // Facebook / Instagram / Messenger. The same image is served from whichever
    // edge PoP is nearest (scontent-del3-1.xx.fbcdn.net, scontent-x.cdninstagram.com,
    // …) with a per-request signed query (oh, oe, _nc_ohc, stp, …); the path (with
    // the media id) is the identity, and it's identical across BOTH CDN families.
    // Collapse host (to one key for both) + drop the query.
    match: (u) => /(?:^|\.)(?:fbcdn\.net|cdninstagram\.com)$/i.test(u.hostname),
    key: (u) => `fbcdn.net${u.pathname}`,
  },
  {
    // WordPress.com / Jetpack Photon: the same image is served from rotating edge
    // digits i0/i1/i2.wp.com; the origin host + path (the rest of the pathname) is
    // the identity, and the resize query is a rendition.
    match: (u) => /^i[0-2]\.wp\.com$/i.test(u.hostname),
    key: (u) => `i.wp.com${u.pathname}`,
  },
  {
    // Google user content (lh3/lh4/….googleusercontent.com): the same asset gets a
    // `=s512` / `=w800-h600` / `=s96-c` size/crop suffix on its last path segment;
    // the segment up to the `=` is the identity. Host kept to avoid over-collapse.
    match: (u) => /(?:^|\.)googleusercontent\.com$/i.test(u.hostname),
    key: (u) => `${u.hostname.toLowerCase()}${u.pathname.replace(/=[^/]*$/, '')}`,
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
const MEDIA_EXT = /\.(?:jpe?g|png|gif|webp|avif|bmp|ico|svgz?|tiff?|hei[cf]|jfif|mp4|webm|mov|m4v|mkv|avi|m3u8|mpd|mp3|m4a|aac|ogg|opus|oga|wav|flac)$/i;

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
  'w', 'h', 'width', 'height', 's', 'size', 'q', 'quality', 'dpr', 'fit', 'crop',
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
  params.sort(); // order-independent: ?a=1&b=2 and ?b=2&a=1 are the same identity
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
