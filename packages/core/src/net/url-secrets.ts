/**
 * Strip secret-looking auth material from a URL — the shared "safety filter" for
 * anything we hand to the user or write to disk (the yt-dlp/ffmpeg command in
 * #285, the metadata sidecar in #284). Removes signatures, tokens, expiry, and
 * presign credentials from the QUERY (keeping benign params like `?res=720`), and
 * redacts Akamai-style token segments embedded in the PATH (`hdnts` token auth:
 * `exp=…~acl=…~hmac=…`, used by many premium video CDNs).
 *
 * Residual: an opaque path-embedded token with no `key=value` shape (a bare long
 * hex/base64 segment) is indistinguishable from a legitimate content hash, so it is
 * NOT redacted — callers handling such URLs must treat the path itself as sensitive.
 */

// Query-param NAMES that carry auth material. Case-insensitive so CloudFront's
// `Signature`/`Expires`/`Key-Pair-Id`/`Policy` and lowercase variants both match.
// We strip aggressively: a leaked signing token is far worse than a URL that
// needs re-authentication.
const SECRET_PARAM_EXACT =
  /^(?:__)?(?:token|access[-_]?token|auth|authorization|apikey|api[-_]?key|key|keyid|key[-_]?pair[-_]?id|sig|signature|signed|sign|hmac|secret|policy|credential|expires?|expiry|hdnts|hdnea|nva|nvb)(?:__)?$/i;
// Whole presigned-URL families: any member means the URL is signed, so drop
// every `x-amz-*` / `x-goog-*` param (AWS SigV4, GCS).
const SECRET_PARAM_PREFIX = /^(?:x-amz-|x-goog-)/i;

const isSecretParam = (name: string): boolean =>
  SECRET_PARAM_EXACT.test(name) || SECRET_PARAM_PREFIX.test(name);

// A PATH segment that is an Akamai-style token rather than a real path component:
// a `~`-joined key=value list carrying an auth-ish key (`exp=…~acl=…~hmac=…`). The
// `~` + a signing key is high-signal, so false positives on real paths are near zero.
const PATH_TOKEN_KEY = /(?:^|~)(?:exp|st|acl|hmac|hdnts?|hdnea?|token|sig|signature|nva|nvb)=/i;
const isTokenSegment = (seg: string): boolean => seg.includes('~') && PATH_TOKEN_KEY.test(seg);

/**
 * Remove secret-looking query params and redact Akamai-style path token segments,
 * keeping benign parts. Returns the input untouched when nothing was stripped (so we
 * never re-encode needlessly), and as-is when it can't be parsed.
 */
export function stripUrlSecrets(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  let changed = false;

  if (u.search) {
    const kept = new URLSearchParams();
    let removed = false;
    for (const [key, value] of u.searchParams) {
      if (isSecretParam(key)) {
        removed = true;
        continue;
      }
      kept.append(key, value);
    }
    if (removed) {
      u.search = kept.toString();
      changed = true;
    }
  }

  const segments = u.pathname.split('/');
  let pathChanged = false;
  for (let i = 0; i < segments.length; i++) {
    if (isTokenSegment(segments[i])) {
      segments[i] = 'REDACTED';
      pathChanged = true;
    }
  }
  if (pathChanged) {
    u.pathname = segments.join('/');
    changed = true;
  }

  return changed ? u.toString() : url;
}
