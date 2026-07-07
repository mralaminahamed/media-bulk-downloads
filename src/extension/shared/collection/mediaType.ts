/**
 * Network-free video/audio type detection and a skip list for media that
 * `chrome.downloads` cannot fetch as a single file.
 */

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'mp4', m4v: 'm4v', webm: 'webm', ogv: 'ogg', ogg: 'ogg', mov: 'mov', qt: 'mov',
};

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'mp3', wav: 'wav', wave: 'wav', ogg: 'ogg', oga: 'oga',
  m4a: 'm4a', aac: 'aac', flac: 'flac', opus: 'opus', weba: 'weba',
};

/** Raw path extension (lowercased), or null. Shared by detectAvType. */
export function extensionFromUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  const seg = path.split('/').pop() ?? '';
  const dot = seg.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = seg.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : null;
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']);

/**
 * The URL's path extension when it names a known image format, preserving the
 * literal spelling (`.jpg` stays `jpg`, not the canonical `jpeg`). Null for
 * data/blob URLs, extension-less paths, or non-image extensions — so a catch-all
 * resolver never derives a bogus extension (e.g. `.php`) from a proxy URL.
 */
export function imageExtFromUrl(url: string): string | null {
  const ext = extensionFromUrl(url);
  return ext && IMAGE_EXTS.has(ext) ? ext : null;
}

/** Normalizes a few MIME subtypes to our canonical format keys. */
function fromMime(mime: string): string | null {
  const m = /^(video|audio)\/([\w.+-]+)/i.exec(mime);
  if (!m) return null;
  const sub = m[2].toLowerCase();
  const NORMALIZE: Record<string, string> = {
    mpeg: 'mp3', 'x-m4a': 'm4a', quicktime: 'mov',
    'x-wav': 'wav', 'x-matroska': 'webm', 'x-flac': 'flac',
  };
  return NORMALIZE[sub] ?? sub;
}

/**
 * Canonical av format from the URL extension (preferred) or the MIME subtype.
 * Returns 'unknown' when neither resolves to a recognized format.
 */
export function detectAvType(url: string, mime?: string): string {
  const ext = extensionFromUrl(url);
  if (ext && (VIDEO_TYPES[ext] || AUDIO_TYPES[ext])) return VIDEO_TYPES[ext] ?? AUDIO_TYPES[ext];
  if (mime) {
    const fromM = fromMime(mime);
    if (fromM && (VIDEO_TYPES[fromM] || AUDIO_TYPES[fromM])) return fromM;
  }
  return 'unknown';
}

/** True for media `chrome.downloads` can't fetch as one file. */
export function isUndownloadableMedia(url: string): boolean {
  return /^blob:/i.test(url) || /\.(m3u8|mpd)(?:[?#]|$)/i.test(url);
}

/** True for an HLS manifest URL — not a single file, but capturable via the HLS
 *  engine (fetch + assemble segments). DASH (.mpd) is handled by `isDashManifest`. */
export function isHlsManifest(url: string): boolean {
  return /\.m3u8(?:[?#]|$)/i.test(url);
}

/** True for a DASH manifest URL — capturable via the DASH engine (fetch + mux). */
export function isDashManifest(url: string): boolean {
  return /\.mpd(?:[?#]|$)/i.test(url);
}

/** File extension for a canonical av type, or null if unrecognized. */
export function avExtensionForType(type: string): string | null {
  return VIDEO_TYPES[type] ?? AUDIO_TYPES[type] ?? null;
}
