/**
 * Build a ready-to-run **yt-dlp / ffmpeg** command for a stream the extension
 * *refused* to capture itself (DRM / live / SAMPLE-AES / unsupported browser).
 * Issue #285: turn a hard "no" into a transparent handoff — a header-correct CLI
 * string the user runs in a tool that's allowed to.
 *
 * This module builds a STRING only: no network call, no execution, no DRM
 * circumvention. Security guarantees, enforced here and covered by tests:
 *   - The only headers emitted are Referer and User-Agent. Never a Cookie.
 *   - Secret-looking query params (signatures, tokens, expiry, presign creds)
 *     are stripped from every URL, so the copied command leaks no credentials.
 *   - Every interpolated value is POSIX single-quoted, so a hostile URL/referer
 *     can't break out of its argument.
 */

export type StreamCommandEngine = 'yt-dlp' | 'ffmpeg';

/** The engines offered in the UI, in display order (yt-dlp first — it handles
 *  HLS/DASH out of the box and is the recommended tool). */
export const STREAM_COMMAND_ENGINES: readonly StreamCommandEngine[] = ['yt-dlp', 'ffmpeg'];

export interface StreamCommandInput {
  /** The sniffed manifest URL (.m3u8 / .mpd). */
  manifestUrl: string;
  engine: StreamCommandEngine;
  /** The page the stream was found on → sent as the Referer header. */
  referer?: string;
  /** The browser's User-Agent, so the external tool presents the same client. */
  userAgent?: string;
}

// Query-param NAMES that carry auth material. Matched case-insensitively so
// CloudFront's `Signature`/`Expires`/`Key-Pair-Id`/`Policy` and lowercase
// variants are both caught. We strip aggressively: a leaked signing token is far
// worse than a command the user must re-authenticate — the issue accepts that.
const SECRET_PARAM_EXACT =
  /^(?:__)?(?:token|access[-_]?token|auth|authorization|apikey|api[-_]?key|key|keyid|key[-_]?pair[-_]?id|sig|signature|signed|sign|hmac|secret|policy|credential|expires?|expiry|hdnts|hdnea|nva|nvb)(?:__)?$/i;
// Whole presigned-URL families: the presence of ANY member means the URL is
// signed, so drop every `x-amz-*` / `x-goog-*` param (AWS SigV4, GCS).
const SECRET_PARAM_PREFIX = /^(?:x-amz-|x-goog-)/i;

const isSecretParam = (name: string): boolean =>
  SECRET_PARAM_EXACT.test(name) || SECRET_PARAM_PREFIX.test(name);

/**
 * Remove secret-looking query params from a URL, keeping benign ones (e.g. a
 * `?res=720` variant selector). Returns the input untouched when it has no query
 * or nothing was stripped (so we never re-encode a URL needlessly), and returns
 * it as-is when it can't be parsed (a bare path can carry no query secret).
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

/** POSIX single-quote a value so shell metacharacters in it are inert. */
const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Assemble the copy-paste CLI command. yt-dlp uses its dedicated `--referer` /
 * `--user-agent` flags; ffmpeg takes the UA via `-user_agent` and the Referer as
 * a single `-headers` string, then stream-copies the manifest to `out.mp4`.
 * Referer/User-Agent are omitted entirely when not supplied.
 */
export function buildStreamCommand({ manifestUrl, engine, referer, userAgent }: StreamCommandInput): string {
  const url = stripUrlSecrets(manifestUrl);
  const ref = referer ? stripUrlSecrets(referer) : undefined;

  if (engine === 'ffmpeg') {
    const parts = ['ffmpeg'];
    if (userAgent) parts.push('-user_agent', shellQuote(userAgent));
    if (ref) parts.push('-headers', shellQuote(`Referer: ${ref}`));
    parts.push('-i', shellQuote(url), '-c', 'copy', shellQuote('out.mp4'));
    return parts.join(' ');
  }

  const parts = ['yt-dlp'];
  if (ref) parts.push('--referer', shellQuote(ref));
  if (userAgent) parts.push('--user-agent', shellQuote(userAgent));
  parts.push(shellQuote(url));
  return parts.join(' ');
}
