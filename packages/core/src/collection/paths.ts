/**
 * Sanitizes a user-supplied path segment: strips path traversal, leading
 * slashes and characters illegal in download filenames. chrome.downloads
 * already rejects absolute paths and "..", but we normalize defensively.
 */
/** Windows reserved device names (also reserved with any extension, e.g. CON.jpg). */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/** Common filesystems cap a single name near 255 bytes; stay well under it and
 *  leave room for prefixes/numbering the download-name layer may still add. */
const MAX_SEGMENT_LEN = 200;

/** Truncate an over-long name, preserving a short trailing extension. */
function capLength(part: string): string {
  if (part.length <= MAX_SEGMENT_LEN) return part;
  const dot = part.lastIndexOf('.');
  if (dot > 0 && part.length - dot <= 12) {
    const ext = part.slice(dot);
    return part.slice(0, MAX_SEGMENT_LEN - ext.length) + ext;
  }
  return part.slice(0, MAX_SEGMENT_LEN);
}

export function sanitizePathSegment(segment: string): string {
  return segment
    // Control chars are intentionally part of the illegal-filename set.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1f]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    // Windows silently strips trailing dots/spaces when resolving a path, which
    // could turn ".. " back into "..". Trim first, then drop . / .. / empties.
    .map((part) => part.replace(/[. ]+$/, ''))
    .filter((part) => part && part !== '.' && part !== '..')
    // Prefix reserved device names so they become ordinary files, not devices.
    .map((part) => (RESERVED_NAME.test(part) ? `_${part}` : part))
    // Bound each segment's length so a crafted 10-KB filename can't break the download.
    .map(capLength)
    .join('/');
}

/** The tokens a download-path template may reference. */
export interface PathTokens {
  host: string;
  domain: string;
  date: string;
  kind: string;
}

/** Tokens the template DSL understands; anything else in `{...}` is dropped. */
const KNOWN_TOKENS = /\{(host|domain|date|kind)\}/g;

/** A single token value must never introduce extra path segments. */
const toSegment = (value: string): string => sanitizePathSegment(value).replace(/\//g, '');

/**
 * Expands a download-path template (e.g. `Media/{domain}/{date}`) against the
 * given token values. Supported tokens: `{host}`, `{domain}`, `{date}`, `{kind}`.
 * A token whose value is empty (e.g. an unknown source host) collapses its
 * segment away; unknown `{...}` tokens are stripped entirely. The final path is
 * run through `sanitizePathSegment`, so it can never escape the download root.
 */
export function expandPathTemplate(template: string, tokens: PathTokens): string {
  const filled = template
    .replace(KNOWN_TOKENS, (_match, key: keyof PathTokens) => toSegment(tokens[key] ?? ''))
    .replace(/\{[^}]*\}/g, ''); // drop unknown tokens rather than leaving braces
  return sanitizePathSegment(filled);
}

/** Extracts the hostname from a URL, or `''` when absent/unparseable. */
export function hostFromUrl(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Two-part public suffixes where the registrable domain needs three labels. */
const TWO_PART_SUFFIX = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'co.jp', 'or.jp', 'ne.jp',
  'com.au', 'net.au', 'org.au',
  'co.nz', 'com.br', 'com.cn', 'co.in', 'co.kr', 'co.za',
]);

/**
 * Reduces a hostname to its registrable domain (drops `www.` and subdomains):
 * `www.twitter.com` → `twitter.com`. A small known set of two-part suffixes
 * (e.g. `co.uk`) keeps the extra label. Heuristic, not a full public-suffix
 * list — good enough for grouping downloads by site.
 */
export function registrableDomain(host: string): string {
  if (!host) return '';
  const labels = host.replace(/^www\./i, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (TWO_PART_SUFFIX.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

/** Today's date as `YYYY-MM-DD`, in the user's local timezone. */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
