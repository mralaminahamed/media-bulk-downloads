/**
 * Read the built-in expiry off a signed CDN URL — the "lease" on that URL.
 *
 * Signed media URLs (fbcdn/cdninstagram `oh`+`oe`, CloudFront `Expires`, AWS/GCS
 * presigned, Akamai `hdnts`) are self-authenticating: they serve from any origin
 * with no Referer and no cookies, until the signature's expiry passes. After
 * that the URL is permanently dead, so anything holding it (the grid, History,
 * Favourites, the download queue) must be able to say so instead of showing a
 * broken image or burning retries on a guaranteed 403.
 *
 * Derived from the URL string alone — no resolver has to opt in, and a presigned
 * S3 URL picked up by the generic resolver benefits just as much as an FB one.
 * A URL with no recognised rule returns null and behaves exactly as before.
 */

/** Clock-skew grace. The lease is advisory: a marginally-stale clock must never
 *  make us refuse a download that would have worked. */
export const LEASE_SKEW_MS = 60_000;

export interface UrlLease {
  /** Epoch milliseconds at which the URL's signature stops being honoured. */
  expiresAt: number;
  /** Which rule produced this lease, for diagnostics and tests. */
  rule: string;
}

const MIN_EPOCH_MS = Date.UTC(2000, 0, 1);
const MAX_LEASE_AHEAD_MS = 10 * 365 * 24 * 3600 * 1000;

/** A parsed expiry only counts when it lands in a plausible window — a garbage
 *  token that happens to parse must not masquerade as a real lease. */
function plausible(expiresAt: number): boolean {
  return (
    Number.isFinite(expiresAt) &&
    expiresAt > MIN_EPOCH_MS &&
    expiresAt < Date.now() + MAX_LEASE_AHEAD_MS
  );
}

const FB_HOST = /(?:^|\.)(?:fbcdn\.net|cdninstagram\.com)$/i;

/** `20260830T000000Z` (ISO 8601 basic) → epoch ms, as AWS/GCS presign it. */
function isoBasicToMs(v: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (!m) return Number.NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function presigned(u: URL, prefix: 'X-Amz' | 'X-Goog', rule: string): UrlLease | null {
  const date = u.searchParams.get(`${prefix}-Date`);
  const seconds = Number(u.searchParams.get(`${prefix}-Expires`));
  if (!date || !Number.isFinite(seconds)) return null;
  const start = isoBasicToMs(date);
  const expiresAt = start + seconds * 1000;
  return plausible(expiresAt) ? { expiresAt, rule } : null;
}

const AKAMAI_EXP = /(?:^|~)exp=(\d{9,12})(?:~|$)/;

export function readUrlLease(url: string): UrlLease | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  if (FB_HOST.test(u.hostname)) {
    const oe = u.searchParams.get('oe');
    // `oe` is lower-case hex SECONDS. parseInt would happily eat a trailing
    // suffix, so require the whole value to be hex before trusting it.
    if (oe && /^[0-9a-f]+$/i.test(oe)) {
      const expiresAt = parseInt(oe, 16) * 1000;
      if (plausible(expiresAt)) return { expiresAt, rule: 'fbcdn' };
    }
    return null;
  }

  // CloudFront signs `Expires` alongside `Signature`+`Key-Pair-Id`; a bare
  // `Expires` on some other host is a cache hint, not a lease.
  if (u.searchParams.has('Signature') && u.searchParams.has('Key-Pair-Id')) {
    const expiresAt = Number(u.searchParams.get('Expires')) * 1000;
    if (plausible(expiresAt)) return { expiresAt, rule: 'cloudfront' };
  }

  if (u.searchParams.has('X-Amz-Expires')) {
    const lease = presigned(u, 'X-Amz', 'aws-sigv4');
    if (lease) return lease;
  }
  if (u.searchParams.has('X-Goog-Expires')) {
    const lease = presigned(u, 'X-Goog', 'gcs');
    if (lease) return lease;
  }

  for (const seg of u.pathname.split('/')) {
    const m = AKAMAI_EXP.exec(seg);
    if (!m) continue;
    const expiresAt = Number(m[1]) * 1000;
    if (plausible(expiresAt)) return { expiresAt, rule: 'akamai-hdnts' };
  }

  return null;
}

/** Whether a persisted `expiresAt` (epoch ms) has lapsed past the skew grace.
 *  Absent or nonsensical values are never expired — see LEASE_SKEW_MS. */
export function isLeaseExpired(expiresAt: number | undefined, nowMs: number): boolean {
  if (expiresAt === undefined || !Number.isFinite(expiresAt)) return false;
  return nowMs > expiresAt + LEASE_SKEW_MS;
}
