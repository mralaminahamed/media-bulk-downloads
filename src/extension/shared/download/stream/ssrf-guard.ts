/**
 * SSRF guard for HLS/DASH stream capture.
 *
 * A stream manifest is page-controlled, and its segment / init / EXT-X-KEY /
 * audio-rendition URLs are fetched from the offscreen document, which holds
 * `<all_urls>` host access (so the fetch is not subject to CORS). Without a
 * constraint, a hostile manifest could aim those fetches at internal, loopback,
 * or link-local hosts — e.g. cloud metadata at `169.254.169.254`, or a service
 * on `localhost` — and have the responses assembled into the file the user
 * downloads. That is a blind server-side request forgery.
 *
 * Every fetch the capture engines make is routed through `assertSafeCaptureUrl`
 * first. The policy: only http(s), and never a host that resolves (literally, by
 * IP form) to a private, loopback, link-local, CGNAT, or multicast range. A
 * plain DNS name is allowed — we can't resolve it here without a network call,
 * and DNS-rebinding is out of scope for a client that fetches once and discards.
 */

const BLOCKED_HOST_EXACT = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

/** Dotted-decimal `a.b.c.d` → [a,b,c,d], or null if not a valid IPv4 literal. */
function dottedV4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  return parts.some((p) => p > 255) ? null : parts;
}

/**
 * A hostname that is a bare number is an IPv4 in disguise, which browsers honour:
 * `http://2130706433/` and `http://0x7f000001/` and `http://017700000001/` all
 * reach 127.0.0.1. Decode decimal / hex / octal forms so the range check applies.
 */
function numericV4(host: string): number[] | null {
  let n: number | null = null;
  if (/^0x[0-9a-f]+$/i.test(host)) n = parseInt(host.slice(2), 16);
  else if (/^0[0-7]+$/.test(host)) n = parseInt(host, 8);
  else if (/^\d+$/.test(host)) n = parseInt(host, 10);
  if (n === null || !Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/** True for loopback, private, link-local, CGNAT, unspecified, and multicast/reserved v4. */
function isBlockedV4([a, b]: number[]): boolean {
  return (
    a === 0 || // 0.0.0.0/8 (this-network / unspecified)
    a === 127 || // loopback
    a === 10 || // private
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 169 && b === 254) || // link-local (incl. 169.254.169.254 metadata)
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    a >= 224 // multicast (224/4) + reserved (240/4) + 255.255.255.255
  );
}

/** True for IPv6 loopback, unspecified, link-local, unique-local, or IPv4-mapped-private. */
function isBlockedV6(raw: string): boolean {
  const h = raw.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (/^fe[89ab]/.test(h)) return true; // link-local fe80::/10
  if (/^f[cd]/.test(h)) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d), which the URL parser normalizes to hex groups
  // (::ffff:7f00:1). Decode the embedded v4 from either form and range-check it.
  if (h.startsWith('::ffff:')) {
    const rest = h.slice(7);
    const dotted = dottedV4(rest);
    if (dotted) return isBlockedV4(dotted);
    const hex = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isBlockedV4([(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255]);
    }
    return true; // mapped but an unrecognized form — block to be safe
  }
  return false;
}

/**
 * Whether a URL is safe for the capture engines to fetch. Rejects non-http(s)
 * schemes and any host that (by literal form) targets an internal range. A
 * normal public DNS name or public IP returns true.
 */
export function isSafeCaptureUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (BLOCKED_HOST_EXACT.has(host)) return false;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return false;

  // IPv6 literals arrive bracketed (e.g. "[::1]").
  if (host.startsWith('[') || host.includes(':')) return !isBlockedV6(host);

  const v4 = dottedV4(host) ?? numericV4(host);
  if (v4) return !isBlockedV4(v4);

  return true; // an ordinary DNS name
}

/** Throws if the URL is not safe for the capture engines to fetch. */
export function assertSafeCaptureUrl(rawUrl: string): void {
  if (!isSafeCaptureUrl(rawUrl)) {
    throw new Error(`Blocked capture fetch to a disallowed host: ${rawUrl}`);
  }
}
