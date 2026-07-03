/**
 * Shared image-filtering logic used by the background worker (badge count),
 * the popup (visible list) and the download handler, so all three agree on
 * which images are "eligible" for a given set of user settings.
 */

import { ImageInfo, SettingsData, FilterOptions, SizeBucket } from '@/types';

/**
 * Whether an image passes the global user settings (minimum size + base64
 * exclusion). Images with unknown intrinsic dimensions (0×0 — typical for
 * srcset candidates and CSS backgrounds) are never excluded by the size rule,
 * since their size can't be known at collection time.
 */
export function passesSettingsFilters(img: ImageInfo, settings: SettingsData): boolean {
  const hasKnownDimensions = img.width > 0 || img.height > 0;
  const meetsSize =
    !hasKnownDimensions ||
    (img.width >= settings.minimumImageSize && img.height >= settings.minimumImageSize);

  const meetsBase64 = !settings.excludeBase64Images || !img.isBase64;

  return meetsSize && meetsBase64;
}

/**
 * Filters a list of images down to those eligible under the given settings.
 */
export function filterImagesBySettings(images: ImageInfo[], settings: SettingsData): ImageInfo[] {
  return images.filter((img) => passesSettingsFilters(img, settings));
}

/** Whether an item falls in a dimension-based size bucket. Unknown dims pass. */
export function inSizeBucket(item: ImageInfo, bucket: SizeBucket): boolean {
  if (bucket === 'all') return true;
  const edge = Math.max(item.width, item.height);
  if (edge <= 0) return true; // unknown dimensions are never hidden
  if (bucket === 'small') return edge < 256;
  if (bucket === 'medium') return edge >= 256 && edge < 1024;
  return edge >= 1024; // large
}

/** Applies the toolbar filters (kind, format, size, min-size, base64). */
export function applyToolbarFilters(items: ImageInfo[], filters: FilterOptions): ImageInfo[] {
  const minBytes = (Number.isFinite(filters.minSize) ? filters.minSize : 0) * 1024;
  return items.filter((item) => {
    if (filters.mediaKind !== 'all' && item.kind !== filters.mediaKind) return false;
    if (!inSizeBucket(item, filters.sizeBucket)) return false;
    if (filters.imageType !== 'all' && item.type !== filters.imageType) return false;
    if (minBytes > 0 && item.fileSize > 0 && item.fileSize < minBytes) return false;
    return !(!filters.includeBase64 && item.isBase64);
  });
}
