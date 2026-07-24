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

/** Swaps (or adds) `rel`'s extension for the one the capture actually produced. */
function withExtension(rel: string, ext: string): string {
  const dot = rel.lastIndexOf('.');
  const slash = Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\'));
  const base = dot > slash ? rel.slice(0, dot) : rel;
  return `${base}.${ext}`;
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
    fileNamePrefix: 'video_',
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
