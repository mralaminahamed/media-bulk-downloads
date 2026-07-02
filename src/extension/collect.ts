/**
 * collect.ts
 *
 * Pure, in-page image collection — used by the content script (to answer
 * GET_IMAGES) and by the on-page bubble (which collects directly).
 *
 * Collection is intentionally network-free. Earlier versions issued a HEAD
 * request per image to read Content-Length; that fired hundreds of cross-origin
 * requests on every tab load and leaked browsing signals. Remote file sizes are
 * reported as unknown (0); base64 sizes are computed locally.
 */

import { ImageInfo } from '@/types';

/** Determines if a URL is a base64-encoded image. */
export function isBase64Image(src: string): boolean {
  return src.startsWith('data:image/');
}

/** Extracts the image type from a base64 data URI. */
export function getBase64ImageType(src: string): string {
  const match = src.match(/^data:image\/([\w.+-]+)\s*;/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

/** Calculates the size of a base64-encoded image in bytes. */
export function getBase64ImageSize(src: string): number {
  const base64 = src.split(',')[1];
  if (!base64) return 0;
  const padding = base64.match(/=+$/)?.[0].length ?? 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Safely retrieves the intrinsic dimensions of an image element. */
export function getImageDimensions(img: HTMLImageElement): { width: number; height: number } {
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

/**
 * Determines the image type from its URL, ignoring query strings and fragments.
 * Returns a lowercase extension-style type, or 'unknown'.
 */
export function getImageType(src: string): string {
  const path = src.split(/[?#]/)[0];
  const lastSegment = path.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex === -1) return 'unknown';

  const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
    case 'jfif':
      return 'jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'avif':
    case 'bmp':
    case 'ico':
      return extension;
    default:
      return 'unknown';
  }
}

/**
 * Parses a srcset attribute into an array of URLs. Splits only on commas that
 * separate candidates — commas inside data: URIs or query strings are preserved.
 */
export function parseSrcset(srcset: string): string[] {
  return srcset
    .trim()
    .split(/,(?=\s*(?:https?:|data:|blob:|\/|\.{1,2}\/|[\w-]+[./]))/i)
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * Resolves a possibly-relative URL against the document base so downloads and
 * previews work. Data URIs are returned unchanged.
 */
export function resolveUrl(src: string): string {
  if (isBase64Image(src)) return src;
  try {
    return new URL(src, document.baseURI).href;
  } catch {
    return src;
  }
}

/** Collects information about all images on the page. */
export function collectImages(): ImageInfo[] {
  const images: ImageInfo[] = [];
  const seenSources = new Set<string>();

  const collectImageInfo = (rawSrc: string, alt = '', width = 0, height = 0): void => {
    if (!rawSrc) return;
    const src = resolveUrl(rawSrc);
    if (seenSources.has(src)) return;
    seenSources.add(src);

    const isBase64 = isBase64Image(src);
    const fileSize = isBase64 ? getBase64ImageSize(src) : 0; // remote size unknown
    const type = isBase64 ? getBase64ImageType(src) : getImageType(src);

    images.push({ src, alt, width, height, type, fileSize, isBase64 });
  };

  // <img> tags and their srcset.
  document.querySelectorAll('img').forEach((img) => {
    const { width, height } = getImageDimensions(img);
    collectImageInfo(img.currentSrc || img.src, img.alt, width, height);
    if (img.srcset) {
      parseSrcset(img.srcset).forEach((src) => collectImageInfo(src, img.alt));
    }
  });

  // <picture> elements: <img> fallback plus every <source srcset>.
  document.querySelectorAll('picture').forEach((picture) => {
    const img = picture.querySelector('img');
    if (img) {
      const { width, height } = getImageDimensions(img);
      collectImageInfo(img.currentSrc || img.src, img.alt, width, height);
      if (img.srcset) {
        parseSrcset(img.srcset).forEach((src) => collectImageInfo(src, img.alt));
      }
    }
    picture.querySelectorAll('source').forEach((source) => {
      if (source.srcset) {
        parseSrcset(source.srcset).forEach((src) => collectImageInfo(src));
      }
    });
  });

  // CSS background-image declarations (handles multiple comma-separated layers).
  document.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const bgImage = window.getComputedStyle(el).getPropertyValue('background-image');
    if (!bgImage || bgImage === 'none') return;
    for (const match of bgImage.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
      if (match[2]) collectImageInfo(match[2]);
    }
  });

  return images;
}
