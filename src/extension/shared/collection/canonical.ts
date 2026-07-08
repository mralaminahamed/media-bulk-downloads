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
    // edge PoP is nearest (scontent-del3-1.xx, scontent-bom1-2.xx, …) with a
    // per-request signed query (oh, oe, _nc_ohc, stp, …); the path (with the
    // media id) is the identity. Collapse the host + drop the query.
    match: (u) => u.hostname === 'fbcdn.net' || u.hostname.endsWith('.fbcdn.net'),
    key: (u) => `fbcdn.net${u.pathname}`,
  },
];

/**
 * The canonical identity key for a media src. A matching SRC_KEY_RULE decides;
 * otherwise the default: when the path names a file (has an extension), drop the
 * query — image CDNs put transforms/cache/signatures there, not identity — but
 * keep the query for an extension-less (dynamic `?id=`) path, where it may carry
 * the identity. Never throws; returns the raw src when unparseable.
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
  const pathIsFile = /\.[a-z0-9]{2,5}$/i.test(u.pathname);
  return pathIsFile ? `${host}${u.pathname}` : `${host}${u.pathname}${u.search}`;
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
