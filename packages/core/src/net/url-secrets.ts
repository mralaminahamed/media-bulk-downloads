/**
 * Strip secret-looking query params from a URL — the shared "safety filter" for
 * anything we hand to the user or write to disk (the yt-dlp/ffmpeg command in
 * #285, the metadata sidecar in #284). Removes signatures, tokens, expiry, and
 * presign credentials while keeping benign params (e.g. a `?res=720` selector).
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

/**
 * Remove secret-looking query params, keeping benign ones. Returns the input
 * untouched when it has no query or nothing was stripped (so we never re-encode
 * needlessly), and as-is when it can't be parsed (a bare path carries no query
 * secret).
 */
export function stripUrlSecrets(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!u.search) return url;
  const kept = new URLSearchParams();
  let removed = false;
  for (const [key, value] of u.searchParams) {
    if (isSecretParam(key)) {
      removed = true;
      continue;
    }
    kept.append(key, value);
  }
  if (!removed) return url;
  u.search = kept.toString();
  return u.toString();
}
