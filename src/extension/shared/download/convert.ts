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
 *  gif (converting would silently drop animation). */
const CONVERTIBLE = /^(png|jpeg|jpg|webp|avif|bmp)$/i;

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
