// Deno stream-capture: fetches an HLS manifest, assembles + muxes it into a
// single file (via the Task 1 stream bundle, SSRF-guarded internally), and
// writes the result under the download root using the same naming/containment
// conventions as downloader.ts.
import { captureHls, browserHlsDeps } from '../core-bundle/stream.gen.js';
import { buildDownloadFilename } from '../core-bundle/download-name.gen.js';
import type { ImageInfo, SettingsData } from '@mbd/core/types';
import { dirname } from 'jsr:@std/path';
import { containedPath } from './paths.ts';

export interface CaptureItem {
  src: string;
  hlsManifest?: string;
  type?: string;
  sourcePage?: { url?: string };
}

export interface CaptureOpts {
  root: string;
  quality: 'highest' | 'lowest' | number;
  audioOnly?: boolean;
  onProgress?: (done: number, total: number) => void;
  captureImpl?: typeof captureHls;
}

/** Refuse to assemble a capture larger than this (bytes). */
const MAX_CAPTURE_BYTES = 2_000_000_000;

/** Maps the user-facing `streamQuality` setting to the capture engine's
 *  variant selector. */
export function streamQualityToEngine(quality: SettingsData['streamQuality']): 'highest' | 'lowest' | number {
  switch (quality) {
    case 'auto':
    case 'best':
      return 'highest';
    case 'worst':
      return 'lowest';
    case '1080':
      return 1080;
    case '720':
      return 720;
    case '480':
      return 480;
    default:
      return 'highest';
  }
}

/** Swaps (or adds) `rel`'s extension for the one the capture actually produced. */
function withExtension(rel: string, ext: string): string {
  const dot = rel.lastIndexOf('.');
  const slash = Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\'));
  const base = dot > slash ? rel.slice(0, dot) : rel;
  return `${base}.${ext}`;
}

/** Slugifies a URL's last path segment for use in a filename, or null when
 *  there isn't a usable one (data/blob URI, trailing slash, unparsable URL). */
function slugFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const last = pathname.split('/').filter(Boolean).pop() ?? '';
  if (!last) return null;
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /* keep raw on malformed escapes */
  }
  const dot = decoded.lastIndexOf('.');
  const base = dot > 0 ? decoded.slice(0, dot) : decoded;
  const slug = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return slug || null;
}

/** A token that keeps two captures from colliding on one filename: the
 *  manifest/src basename slug (when there's a usable one — for
 *  readability) plus a millisecond timestamp (for uniqueness). HLS
 *  manifests are almost always named generically (`playlist.m3u8`,
 *  `master.m3u8`), so the slug alone repeats across unrelated videos;
 *  the timestamp guarantees two captures never overwrite each other even
 *  when the basename is identical. Restricted to filename-safe characters;
 *  the caller additionally runs it back through the core naming pipeline's
 *  sanitizer. */
function captureToken(item: CaptureItem): string {
  const slug = slugFromUrl(item.hlsManifest) ?? slugFromUrl(item.src);
  const token = slug ? `${slug}-${Date.now()}` : `${Date.now()}`;
  return token.replace(/[^a-zA-Z0-9._-]/g, '');
}

export async function captureStream(
  item: CaptureItem,
  opts: CaptureOpts,
): Promise<{ path: string; ext: string; bytes: number }> {
  const manifestUrl = item.hlsManifest ?? item.src;
  const cap = opts.captureImpl ?? captureHls;
  const res = await cap(manifestUrl, browserHlsDeps(opts.onProgress), {
    quality: opts.quality,
    maxBytes: MAX_CAPTURE_BYTES,
    audioOnly: opts.audioOnly,
  });

  const settings = {
    downloadPath: '{domain}',
    fileNamePrefix: `video-${captureToken(item)}-`,
    namingMode: 'prefixed',
  } as unknown as SettingsData;
  const rel = withExtension(
    buildDownloadFilename(item as unknown as ImageInfo, 0, settings, item.sourcePage?.url),
    res.ext,
  );

  const abs = containedPath(opts.root, rel);
  await Deno.mkdir(dirname(abs), { recursive: true });
  await Deno.writeFile(abs, res.bytes);
  return { path: abs, ext: res.ext, bytes: res.bytes.length };
}
