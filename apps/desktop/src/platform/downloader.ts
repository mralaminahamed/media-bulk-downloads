// Value-import from the pre-bundled ESM (deno desktop can't resolve bare
// @mbd/core source imports — see docs/runtime-recipe.md). Type-only imports stay
// on @mbd/core/types (erased at runtime, no resolution needed).
import { buildDownloadFilename } from '../core-bundle/download-name.gen.js';
import type { ImageInfo, SettingsData } from '@mbd/core/types';
import { dirname, join, normalize, SEPARATOR } from 'jsr:@std/path';

export interface DownloadItem {
  src: string;
  ext?: string;
  type?: string;
  kind?: 'image' | 'video' | 'audio';
  sourcePage?: { url?: string };
}

export interface DownloadOpts {
  root: string;
  template: string;
  /** 0-based (0 = first item); core appends `index + 1` to the filename, so
   *  index 0 names the file `image_1.<ext>`. */
  index: number;
  sourcePageUrl?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  namingMode?: 'prefixed' | 'original';
  fileNamePrefix?: string;
}

export async function downloadOne(
  item: DownloadItem,
  opts: DownloadOpts,
): Promise<{ path: string }> {
  const settings = {
    downloadPath: opts.template,
    fileNamePrefix: opts.fileNamePrefix ?? 'image_',
    namingMode: opts.namingMode ?? 'prefixed',
  } as unknown as SettingsData;

  const rel = buildDownloadFilename(item as unknown as ImageInfo, opts.index, settings, opts.sourcePageUrl);

  const rootNorm = normalize(opts.root);
  const abs = normalize(join(rootNorm, rel));
  if (abs !== rootNorm && !abs.startsWith(rootNorm + SEPARATOR)) {
    throw new Error(`refusing path outside root: ${abs}`);
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(item.src, { headers: opts.headers });
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${item.src}`);
  const buf = new Uint8Array(await res.arrayBuffer());

  await Deno.mkdir(dirname(abs), { recursive: true });
  await Deno.writeFile(abs, buf);
  return { path: abs };
}
