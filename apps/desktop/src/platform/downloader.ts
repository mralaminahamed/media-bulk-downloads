import { buildDownloadFilename } from '@mbd/core/collection/download-name';
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
  index: number;
  sourcePageUrl?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export async function downloadOne(
  item: DownloadItem,
  opts: DownloadOpts,
): Promise<{ path: string }> {
  const settings = {
    downloadPath: opts.template,
    fileNamePrefix: 'image_',
    namingMode: 'prefixed',
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
