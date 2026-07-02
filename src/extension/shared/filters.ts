/**
 * Shared image-filtering logic used by the background worker (badge count),
 * the popup (visible list) and the download handler, so all three agree on
 * which images are "eligible" for a given set of user settings.
 */

import { ImageInfo, SettingsData } from '@/types';

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
