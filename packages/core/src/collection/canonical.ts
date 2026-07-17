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

// Sankaku media hosts (v./s./legacy cdn.sankakucomplex.com) and the 32-hex md5
// content-hash filename stem a post's preview/sample/original tiers all share.
const SANKAKU_HOST = /(?:^|\.)sankakucomplex\.com$/i;
const SANKAKU_MEDIA =
  /\/data\/(?:preview\/|sample\/)?(?:[0-9a-f]{2}\/)*([0-9a-f]{32})\.(?:avif|jpe?g|png|gif|webp)$/i;

// RED / Xiaohongshu media CDN (sns-webpic-qc.xhscdn.com & siblings). Signed URL:
//   /<ts:12-digit>/<hash:32-hex>/<bucket>/<token>!<rendition>
// The <ts>+<hash> are a per-rendition signature that rotates on every re-sign; the
// <bucket>/<token> is the note's stable fileId (shared across cover/detail/re-signs).
// RED also runs an international CDN family for rednote.com (rednotecdn.com, e.g.
// sns-web-i10.rednotecdn.com) serving the identical signed shape for the same
// fileId. XHS_HOST matches both, but the key prefix below is deliberately the
// fixed string 'xhscdn.com' (not host-derived): an xhscdn.com URL and a
// rednotecdn.com URL for the SAME fileId must produce the SAME key so the two CDN
// families fold to one identity — mirroring the fbcdn rule folding cdninstagram.
const XHS_HOST = /(?:^|\.)(?:xhscdn|rednotecdn)\.com$/i;
const XHS_SIGNED_PREFIX = /^\/\d{6,}\/[0-9a-f]{32}\//i;

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
    // the segment up to the final `=size` token is the identity (only the trailing
    // `=…` is stripped, so a token with an embedded `=` is not truncated early).
    // Host kept to avoid over-collapse.
    match: (u) => /(?:^|\.)googleusercontent\.com$/i.test(u.hostname),
    key: (u) => `${u.hostname.toLowerCase()}${u.pathname.replace(/=[^/=]*$/, '')}`,
  },
  {
    // imgix (*.imgix.net): every query param is a rendition / transform / signature
    // EXCEPT `page` (selects a page of a multi-page source, e.g. a PDF) and `frame`
    // (selects a still from an animated source) — each names genuinely different
    // content, not a rendition — so they are kept as part of the identity, in a
    // fixed order for a stable key. Custom imgix domains are out of scope for v1.
    match: (u) => /(?:^|\.)imgix\.net$/i.test(u.hostname),
    key: (u) => {
      const q = new URLSearchParams(u.search);
      const base = `${u.hostname.toLowerCase()}${u.pathname}`;
      const ids = ['frame', 'page'].filter((k) => q.has(k)).map((k) => `${k}=${q.get(k)}`);
      return ids.length ? `${base}?${ids.join('&')}` : base;
    },
  },
  {
    // Cloudinary (res.cloudinary.com): the /upload/ (or /fetch/) path may carry a
    // transform segment right after it — a comma-list of one or more `key_value`
    // tokens (w_400, or the chained w_800,c_fill) — validated token-by-token with
    // the SAME grammar as imageUrl.ts's isCloudinaryTransform (each key must be a
    // real Cloudinary transform key and its value must carry no `_`), so a
    // look-alike folder (comma-named, or a single "my_folder") is never mistaken
    // for one. It also carries an auto-version segment (v + exactly 10-digit
    // Unix-epoch timestamp, only right after upload/fetch, so a hand-named /v2/
    // folder — or a 7-9 digit order-id/SKU folder — is never mistaken for one).
    // Both are renditions, the public id is the identity.
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
    // Twitter media (pbs.twimg.com, etc.): `name=` (small/large/orig) and `format=`
    // pick a rendition; a legacy `:size` suffix does the same on the path. The media
    // id in the path is the identity; drop the query and the :size suffix. (The
    // download path still upgrades to the original via the twitter resolver.)
    match: (u) => /(?:^|\.)twimg\.com$/i.test(u.hostname),
    key: (u) => `${u.hostname.toLowerCase()}${u.pathname.replace(/:(?:thumb|small|medium|large|orig)$/i, '')}`,
  },
  {
    // Pinterest (i.pinimg.com): the leading size folder (236x / 474x / 564x /
    // <W>x<H> / <W>x<H>_RS) and /originals/ are renditions of one asset — the hash
    // path (/44/0b/38/<hash>.jpg) is the identity. Mirrors the imageUrl.ts upgrade
    // regex so a sniffed `orig` and a residual DOM thumbnail dedup to one row.
    // custom_covers/… and upload/… (distinct, non-upgradeable artifacts) are left
    // whole by the anchored regex.
    match: (u) => u.hostname === 'i.pinimg.com',
    key: (u) => `i.pinimg.com${u.pathname.replace(/^\/(?:\d+x(?:\d+)?(?:_RS)?|originals)\//, '/')}`,
  },
  {
    // Sankaku (v./s./cdn.sankakucomplex.com): a post's preview (.avif), sample, and
    // original (.jpg/.png/…) tiers share a 32-hex md5 content-hash in the path and
    // differ only in the /preview//sample/ folder + the extension; every tier is
    // signed with an expiring token (?e&expires&m&token). Key on the md5 alone so
    // all tiers fold to one identity (the original, being largest, wins) and the
    // rotating token never enters the key. md5 is a content hash → no collisions.
    // Image-only + /data/-gated, mirroring the resolver (sankaku.ts): a video
    // original (.mp4/.webm/…) must NOT fold with its same-md5 poster, so it is
    // deliberately excluded here and keys via the generic MEDIA_EXT branch instead.
    // There is deliberately no imageUrl.ts RULES entry: a preview→original rewrite
    // would drop the signature and 404.
    match: (u) => SANKAKU_HOST.test(u.hostname) && SANKAKU_MEDIA.test(u.pathname),
    key: (u) => `sankakucomplex.com/data/${u.pathname.match(SANKAKU_MEDIA)![1].toLowerCase()}`,
  },
  {
    // RED / Xiaohongshu (sns-webpic-qc.xhscdn.com & siblings, plus the
    // rednotecdn.com international family): a note image's feed cover
    // (!nc_n_webp_mw_1), opened detail (!nd_dft_wlteh_webp_3), and every re-signed
    // copy — from EITHER CDN family — share the fileId <bucket>/<token> in the path
    // and differ only in the rotating /<ts>/<hash>/ signature prefix and the
    // !<rendition> suffix. Key on the fileId alone, under the fixed 'xhscdn.com'
    // prefix (not the actual hostname), so a China xhscdn.com URL and an
    // international rednotecdn.com URL of the SAME fileId fold to one identity
    // (the largest, displayed WB_DFT wins) and the rotating signature never enters
    // the key. There is deliberately no imageUrl.ts RULES entry: the signature is
    // path-embedded, so a rewrite would drop it and 404.
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
// NOT stripped: `crop` selects WHICH pixels (crop=face vs crop=top vs crop=entropy
// are different output images from one endpoint), so folding it would merge
// genuinely different images and silently drop one. The rest above only change an
// image's size/format/quality — the same picture — so collapsing them is correct.

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
