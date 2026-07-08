import { ImageInfo } from '@/types';

/**
 * Client-side image format conversion, run in the popup/bubble. The source image
 * is fetched to a blob first (host permissions bypass page CORS), and the blob is
 * same-origin, so drawing it to a canvas and reading it back is NOT tainted.
 */

export type ConvertTarget = 'png' | 'jpeg';

const TARGET_EXT: Record<ConvertTarget, string> = { png: 'png', jpeg: 'jpg' };
const TARGET_MIME: Record<ConvertTarget, string> = { png: 'image/png', jpeg: 'image/jpeg' };

/** Raster types we can decode and re-encode. Excludes svg (vector) and ico, and
 *  gif (converting would silently drop animation). Animated webp/avif also carry
 *  animation, but can't be told apart by type alone — convertImage sniffs the
 *  header and skips them at runtime (see isAnimatedImage). */
const CONVERTIBLE = /^(png|jpeg|jpg|webp|avif|bmp)$/i;

/**
 * Detects an animated WebP/AVIF from its container header, so the canvas
 * re-encode (which keeps only the first frame) doesn't silently strip the
 * animation — the caller falls back to a plain download of the original instead,
 * the same rationale as excluding gif. Bounds-checked; safe on short buffers.
 */
export function isAnimatedImage(header: Uint8Array): boolean {
  const fourCC = (o: number, s: string): boolean =>
    header.length >= o + 4 &&
    String.fromCharCode(header[o], header[o + 1], header[o + 2], header[o + 3]) === s;
  // Animated WebP: RIFF/WEBP with an extended 'VP8X' chunk whose flags byte
  // (offset 20) has the animation bit (0x02) set.
  if (fourCC(0, 'RIFF') && fourCC(8, 'WEBP') && fourCC(12, 'VP8X')) {
    return header.length > 20 && (header[20] & 0x02) !== 0;
  }
  // Animated AVIF: an image sequence declares the 'avis' brand in its ftyp box
  // (as the major brand or any compatible brand).
  if (fourCC(4, 'ftyp')) {
    const boxSize = Math.min(
      (header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3],
      header.length,
    );
    for (let o = 8; o + 4 <= boxSize; o += 4) {
      if (fourCC(o, 'avis')) return true;
    }
  }
  return false;
}

/** Whether an item should be converted to `target` (raster image, not already it). */
export function isConvertible(image: ImageInfo, target: ConvertTarget): boolean {
  if (image.kind !== 'image' || image.isBase64) return false;
  if (!CONVERTIBLE.test(image.type)) return false;
  const normalized = image.type.toLowerCase() === 'jpg' ? 'jpeg' : image.type.toLowerCase();
  return normalized !== target;
}

export interface ConvertedImage {
  bytes: Uint8Array;
  /** File extension for the converted image (`png` / `jpg`). */
  ext: string;
  mime: string;
}

/** Injectable canvas primitives — the real ones aren't present under jsdom. */
export interface ConvertDeps {
  createImageBitmap: (blob: Blob) => Promise<ImageBitmap>;
  makeCanvas: (width: number, height: number) => OffscreenCanvas;
}

const defaultDeps: ConvertDeps = {
  createImageBitmap: (blob) => createImageBitmap(blob),
  makeCanvas: (w, h) => new OffscreenCanvas(w, h),
};

/**
 * Decode `blob` and re-encode it as `target`. Returns null on any failure (an
 * undecodable image, a missing 2D context) so the caller can fall back to a plain
 * download. JPEG has no alpha, so a white background is painted first.
 */
export async function convertImage(
  blob: Blob,
  target: ConvertTarget,
  deps: ConvertDeps = defaultDeps,
): Promise<ConvertedImage | null> {
  try {
    // Preserve animation: an animated webp/avif would lose every frame but the
    // first through the canvas re-encode, so bail and let the caller download the
    // original untouched (null = "couldn't convert, download as-is").
    const header = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    if (isAnimatedImage(header)) return null;
    const bitmap = await deps.createImageBitmap(blob);
    const canvas = deps.makeCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (target === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const out = await canvas.convertToBlob({
      type: TARGET_MIME[target],
      quality: target === 'jpeg' ? 0.92 : undefined,
    });
    return { bytes: new Uint8Array(await out.arrayBuffer()), ext: TARGET_EXT[target], mime: TARGET_MIME[target] };
  } catch {
    return null;
  }
}
