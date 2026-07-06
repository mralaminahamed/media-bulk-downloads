import { ImageInfo, SettingsData } from '@/types';
import {
  sanitizePathSegment,
  expandPathTemplate,
  hostFromUrl,
  registrableDomain,
  todayISO,
} from './paths';
import { avExtensionForType, extensionFromUrl } from './mediaType';

/**
 * Naming and folder-path derivation for downloads. Kept in `shared/` (not the
 * background entry) so both the service worker's per-file downloads and the ZIP
 * builder — which runs in the popup/bubble React context — produce identical
 * filenames and folder structure from one source of truth.
 */

/**
 * Maps a collected image type to a safe file extension.
 */
export function extensionForType(type: string): string {
  switch (type) {
    case 'jpeg':
      return 'jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'avif':
    case 'bmp':
    case 'ico':
      return type;
    default:
      return 'jpg';
  }
}

/**
 * Derives a safe base filename (no extension) from an image URL, or null when the
 * URL carries no usable name — data/blob URIs, or paths with no basename
 * (trailing slash / query-only). The caller appends the detected extension.
 */
export function originalNameFromUrl(url: string): string | null {
  if (/^(data|blob):/i.test(url)) return null;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const last = pathname.split('/').pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /* keep raw on malformed escapes */
  }

  // Strip a trailing extension only when the dot isn't the first char.
  const dot = decoded.lastIndexOf('.');
  const base = dot > 0 ? decoded.slice(0, dot) : decoded;

  const safe = sanitizePathSegment(base).split('/').pop() ?? '';
  return safe || null;
}

/** The file extension a downloaded item should carry (image or a/v). */
export function downloadExtension(image: ImageInfo): string {
  return image.kind === 'image'
    ? image.ext || extensionForType(image.type)
    : avExtensionForType(image.type) ??
        extensionFromUrl(image.src) ??
        (image.kind === 'video' ? 'mp4' : 'mp3');
}

/**
 * Builds a safe, relative download path for an image. `settings.downloadPath`
 * is a template that may reference `{host}`, `{domain}`, `{date}`, and `{kind}`
 * tokens; `sourcePageUrl` supplies the site those tokens resolve against.
 */
export function buildDownloadFilename(
  image: ImageInfo,
  index: number,
  settings: SettingsData,
  sourcePageUrl?: string,
): string {
  const extension = downloadExtension(image);
  const prefixed = `${sanitizePathSegment(settings.fileNamePrefix) || 'image_'}${index + 1}.${extension}`;

  let fileName: string;
  if (settings.namingMode === 'original') {
    const name = originalNameFromUrl(image.src);
    fileName = name ? `${name}.${extension}` : prefixed;
  } else {
    fileName = prefixed;
  }

  const host = hostFromUrl(sourcePageUrl);
  const dir = expandPathTemplate(settings.downloadPath, {
    host,
    domain: registrableDomain(host),
    date: todayISO(),
    kind: image.kind,
  });
  return dir ? `${dir}/${fileName}` : fileName;
}
