/**
 * The single table of media formats the extension understands.
 *
 * Four independent extension lists used to disagree — `mediaType.ts`'s
 * `IMAGE_EXTS`, `imageUrl.ts`'s `MEDIA_EXT` and `normalizeFormat`,
 * `canonical.ts`'s `MEDIA_EXT`, and `download-name.ts`'s `extensionForType` — so
 * a `.heic` URL was a valid dedupe key but an unknown type, and therefore landed
 * on disk as `photo.jpg` carrying HEIC bytes. Everything that needs to know
 * "is this an image / what type is it / what should the file be called" reads
 * this module.
 *
 * `type` is the canonical key stored on `ImageInfo.type`; `ext` is what the
 * downloaded file is named. They differ only where a format has several
 * spellings (`jpg`/`jpeg`/`jfif` → type `jpeg`, ext `jpg`).
 */

interface ImageFormat {
  /** Canonical `ImageInfo.type`. */
  type: string;
  /** Extension the saved file should carry. */
  ext: string;
  /** Human label for the format filter chips. */
  label: string;
  /** Every path extension / MIME subtype / `format=` value that means this. */
  aliases: readonly string[];
}

const IMAGE_FORMATS: readonly ImageFormat[] = [
  { type: 'jpeg', ext: 'jpg', label: 'JPEG', aliases: ['jpg', 'jpeg', 'jfif', 'jpe', 'pjpeg'] },
  { type: 'png', ext: 'png', label: 'PNG', aliases: ['png', 'x-png'] },
  // Animated PNG is a distinct media type (image/apng) and must keep its own
  // extension — renaming it .png loses nothing, but renaming it .jpg breaks it.
  { type: 'apng', ext: 'apng', label: 'APNG', aliases: ['apng'] },
  { type: 'gif', ext: 'gif', label: 'GIF', aliases: ['gif'] },
  { type: 'webp', ext: 'webp', label: 'WebP', aliases: ['webp'] },
  { type: 'avif', ext: 'avif', label: 'AVIF', aliases: ['avif'] },
  { type: 'heic', ext: 'heic', label: 'HEIC', aliases: ['heic', 'heic-sequence'] },
  { type: 'heif', ext: 'heif', label: 'HEIF', aliases: ['heif', 'heif-sequence'] },
  { type: 'jxl', ext: 'jxl', label: 'JPEG XL', aliases: ['jxl'] },
  { type: 'tiff', ext: 'tiff', label: 'TIFF', aliases: ['tif', 'tiff'] },
  { type: 'jp2', ext: 'jp2', label: 'JPEG 2000', aliases: ['jp2', 'j2k', 'jpf', 'jpx', 'jpm', 'jpeg2000'] },
  { type: 'bmp', ext: 'bmp', label: 'BMP', aliases: ['bmp', 'dib', 'x-ms-bmp'] },
  { type: 'ico', ext: 'ico', label: 'ICO', aliases: ['ico', 'cur', 'x-icon', 'vnd.microsoft.icon'] },
  // `svgz` is gzip-compressed SVG: same type, but the file must keep the .svgz
  // name or nothing will open it.
  { type: 'svg', ext: 'svg', label: 'SVG', aliases: ['svg', 'svgz', 'svg+xml'] },
];

const BY_ALIAS = new Map<string, ImageFormat>();
for (const f of IMAGE_FORMATS) for (const a of f.aliases) BY_ALIAS.set(a, f);

const BY_TYPE = new Map<string, ImageFormat>(IMAGE_FORMATS.map((f) => [f.type, f]));

/** Extensions that must keep their literal spelling rather than the format's
 *  canonical `ext` — a compressed or alternate container the canonical name
 *  would misrepresent. */
const LITERAL_EXTS = new Set(['svgz']);

export const IMAGE_FORMAT_LABELS: Record<string, string> =
  Object.fromEntries(IMAGE_FORMATS.map((f) => [f.type, f.label]));

/** Canonical image type for any spelling (path extension, MIME subtype,
 *  `format=`/`fm=` value), or `'unknown'`. */
export function normalizeImageFormat(raw: string): string {
  return BY_ALIAS.get(raw.trim().toLowerCase())?.type ?? 'unknown';
}

/** The extension a file of this canonical type should carry, or null when the
 *  type isn't an image this table owns (callers supply their own fallback). */
export function imageExtForType(type: string): string | null {
  return BY_TYPE.get(type.toLowerCase())?.ext ?? null;
}

/** The extension to save a URL under, preserving a spelling that carries meaning
 *  (`.svgz`) and otherwise normalising (`.jpeg` → `jpg`). */
export function preferredImageExt(rawExt: string): string | null {
  const lower = rawExt.trim().toLowerCase();
  if (LITERAL_EXTS.has(lower)) return lower;
  return BY_ALIAS.get(lower)?.ext ?? null;
}

export function isImageExt(ext: string): boolean {
  return BY_ALIAS.has(ext.trim().toLowerCase());
}

/** Video + audio container extensions, as a single downloadable file. */
const AV_EXTS: ReadonlySet<string> = new Set([
  'mp4', 'm4v', 'webm', 'ogv', 'mov', 'qt', 'mkv', 'avi',
  'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'wave', 'weba', 'flac',
]);

/** Adaptive-streaming manifests — capturable, never a direct download. */
const STREAM_EXTS: ReadonlySet<string> = new Set(['m3u8', 'mpd']);

export function isAvExt(ext: string): boolean {
  return AV_EXTS.has(ext.trim().toLowerCase());
}

export function isStreamExt(ext: string): boolean {
  return STREAM_EXTS.has(ext.trim().toLowerCase());
}

const escapeAlt = (exts: Iterable<string>): string =>
  [...exts].sort((a, b) => b.length - a.length).join('|');

// The image-format aliases include MIME-only spellings (`svg+xml`, `x-icon`,
// `x-ms-bmp`, `heic-sequence`, `vnd.microsoft.icon`, `jpeg2000`) that are NOT real
// file extensions — some carry `.`/`-`, which would inject regex wildcards / bogus
// tokens into a pathname test. Keep only file-extension-shaped aliases here.
const IMAGE_PATH_EXTS = [...BY_ALIAS.keys()].filter((e) => /^[a-z0-9]{1,5}$/.test(e));

/** Every media extension, for a `$`-anchored pathname test (canonical keys). */
export const MEDIA_EXT_PATH_RE = new RegExp(
  `\\.(?:${escapeAlt(IMAGE_PATH_EXTS)}|${escapeAlt(AV_EXTS)}|${escapeAlt(STREAM_EXTS)})$`,
  'i',
);

/** Every media extension, allowing a trailing query/fragment (URL sniffing). */
export const MEDIA_EXT_URL_RE = new RegExp(
  `\\.(?:${escapeAlt(IMAGE_PATH_EXTS)}|${escapeAlt(AV_EXTS)})(?:$|[?#])`,
  'i',
);
