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

import { stripUrlSecrets } from '@mbd/core/net/url-secrets';
import { streamQualityToEngine, StreamQuality } from '@mbd/core/download/stream/quality';

export { stripUrlSecrets };

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
  /** The user asked for audio-only: emit an audio-extraction command (yt-dlp `-x`,
   *  ffmpeg `-vn -c:a copy … out.m4a`) rather than a full-stream copy. */
  audioOnly?: boolean;
  /** The user's "Stream quality" preference, so the handoff command targets the
   *  same rendition the in-extension capture would have picked instead of yt-dlp's
   *  default (best). Applied to yt-dlp only (via `-S`); ffmpeg's HLS variant
   *  selection isn't a simple flag, so it's left at the demuxer default. Omitted
   *  when audio-only (the video-res selector doesn't apply). */
  quality?: StreamQuality;
}

/** POSIX single-quote a value so shell metacharacters in it are inert. */
const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Assemble the copy-paste CLI command. yt-dlp uses its dedicated `--referer` /
 * `--user-agent` flags; ffmpeg takes the UA via `-user_agent` and the Referer as
 * a single `-headers` string, then stream-copies the manifest to `out.mp4`.
 * Referer/User-Agent are omitted entirely when not supplied.
 */
export function buildStreamCommand({ manifestUrl, engine, referer, userAgent, audioOnly, quality }: StreamCommandInput): string {
  const url = stripUrlSecrets(manifestUrl);
  const ref = referer ? stripUrlSecrets(referer) : undefined;

  if (engine === 'ffmpeg') {
    const parts = ['ffmpeg'];
    if (userAgent) parts.push('-user_agent', shellQuote(userAgent));
    if (ref) parts.push('-headers', shellQuote(`Referer: ${ref}`));
    parts.push('-i', shellQuote(url));
    if (audioOnly) parts.push('-vn', '-c:a', 'copy', shellQuote('out.m4a'));
    else parts.push('-c', 'copy', shellQuote('out.mp4'));
    return parts.join(' ');
  }

  const parts = ['yt-dlp'];
  if (audioOnly) parts.push('-x');
  else if (quality) {
    const sel = streamQualityToEngine(quality);
    if (typeof sel === 'number') parts.push('-S', shellQuote(`res:${sel}`));
    else if (sel === 'lowest') parts.push('-S', shellQuote('+res'));
  }
  if (ref) parts.push('--referer', shellQuote(ref));
  if (userAgent) parts.push('--user-agent', shellQuote(userAgent));
  parts.push(shellQuote(url));
  return parts.join(' ');
}
