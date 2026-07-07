/**
 * Shared image-filtering logic used by the background worker (badge count),
 * the popup (visible list) and the download handler, so all three agree on
 * which images are "eligible" for a given set of user settings.
 */

import { ImageInfo, SettingsData, FilterOptions, SizeBucket, SortKey, SortDir } from '@/types';
import { originalNameFromUrl } from './download-name';
import { isEmojiUrl } from './emoji';
import { hostFromUrl } from './paths';

/**
 * Whether an image passes the global user settings (minimum size + base64
 * exclusion). Images with unknown intrinsic dimensions (0×0 — typical for
 * srcset candidates and CSS backgrounds) are never excluded by the size rule,
 * since their size can't be known at collection time.
 */
export function passesSettingsFilters(img: ImageInfo, settings: SettingsData): boolean {
  // Enforce the minimum only on dimensions that are actually known. A 0 is
  // "unknown" (srcset candidates, CSS backgrounds, video/audio) and must never
  // exclude the item — including the half-known case (e.g. 500×0), where the old
  // AND-of-both check wrongly dropped the item on the unknown side.
  const meetsSize =
    (img.width === 0 || img.width >= settings.minimumImageSize) &&
    (img.height === 0 || img.height >= settings.minimumImageSize);

  const meetsBase64 = !settings.excludeBase64Images || !img.isBase64;

  // Emoji graphics (twemoji from Twitter/WordPress/GitHub/etc.) are hidden only
  // when the user opts in. Keyed off src, so harmless for non-image kinds.
  const meetsEmoji = !settings.excludeEmoji || !isEmojiUrl(img.src);

  // HLS (.m3u8) streams are surfaced only when the user opts into stream capture.
  // When off they're hidden everywhere this gate runs — badge count, popup/bubble
  // list, and download eligibility — so no capture button or "HLS" tile appears.
  const meetsHls = settings.captureHlsStreams || !img.hlsManifest;

  return meetsSize && meetsBase64 && meetsHls && meetsEmoji;
}

/**
 * Filters a list of images down to those eligible under the given settings.
 */
export function filterImagesBySettings(images: ImageInfo[], settings: SettingsData): ImageInfo[] {
  return images.filter((img) => passesSettingsFilters(img, settings));
}

/** Whether an item falls in a dimension-based size bucket. Unknown dims pass. */
function inSizeBucket(item: ImageInfo, bucket: SizeBucket): boolean {
  if (bucket === 'all') return true;
  const edge = Math.max(item.width, item.height);
  if (edge <= 0) return true; // unknown dimensions are never hidden
  if (bucket === 'small') return edge < 256;
  if (bucket === 'medium') return edge >= 256 && edge < 1024;
  return edge >= 1024; // large
}

/** A readable filename for an item (basename from the URL, else the raw src). */
function itemName(item: ImageInfo): string {
  return originalNameFromUrl(item.src) ?? item.src;
}

/** Whether an item matches a free-text query (filename, alt, type, or URL). */
function matchesSearch(item: ImageInfo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    itemName(item).toLowerCase().includes(q) ||
    (item.alt ?? '').toLowerCase().includes(q) ||
    item.type.toLowerCase().includes(q) ||
    item.src.toLowerCase().includes(q)
  );
}

/**
 * Comparator for a sort key. Items with an unknown value (size/area 0) always
 * sort last regardless of direction, so the "biggest/smallest" views aren't
 * polluted by srcset candidates and CSS backgrounds whose size is unknown.
 */
function compareBy(a: ImageInfo, b: ImageInfo, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  if (key === 'name') return sign * itemName(a).localeCompare(itemName(b), undefined, { numeric: true, sensitivity: 'base' });
  if (key === 'type') return sign * (a.type.localeCompare(b.type) || itemName(a).localeCompare(itemName(b)));

  // Numeric keys: size (bytes) or dimensions (pixel area). 0 = unknown → last.
  const value = (i: ImageInfo): number => (key === 'size' ? i.fileSize : i.width * i.height);
  const va = value(a);
  const vb = value(b);
  if (va === 0 && vb === 0) return 0;
  if (va === 0) return 1; // unknown always after known
  if (vb === 0) return -1;
  return sign * (va - vb);
}

export interface ExcludedMatchers {
  urls: Set<string>;
  hosts: Set<string>;
}

/** Whether a media src is on the user's exclusion blocklist (exact URL or host). */
export function isExcluded(src: string, m: ExcludedMatchers): boolean {
  if (m.urls.has(src)) return true;
  const host = hostFromUrl(src);
  return host !== '' && m.hosts.has(host);
}

/** Removes excluded items from a list. */
export function filterExcluded(items: ImageInfo[], m: ExcludedMatchers): ImageInfo[] {
  if (m.urls.size === 0 && m.hosts.size === 0) return items;
  return items.filter((i) => !isExcluded(i.src, m));
}

/**
 * Applies the toolbar filters (kind, format, size, min-size, base64), the
 * free-text search, and the chosen sort order. Filtering is followed by an
 * optional stable sort; `sortBy: 'default'` preserves collection order.
 */
export function applyToolbarFilters(items: ImageInfo[], filters: FilterOptions): ImageInfo[] {
  const minBytes = (Number.isFinite(filters.minSize) ? filters.minSize : 0) * 1024;
  const shown = items.filter((item) => {
    if (filters.mediaKind !== 'all' && item.kind !== filters.mediaKind) return false;
    if (!inSizeBucket(item, filters.sizeBucket)) return false;
    if (filters.imageType !== 'all' && item.type !== filters.imageType) return false;
    if (minBytes > 0 && item.fileSize > 0 && item.fileSize < minBytes) return false;
    if (!filters.includeBase64 && item.isBase64) return false;
    return matchesSearch(item, filters.search ?? '');
  });

  if (filters.sortBy && filters.sortBy !== 'default') {
    // Copy first — sort mutates, and `items` (state) must not be reordered in place.
    return [...shown].sort((a, b) => compareBy(a, b, filters.sortBy, filters.sortDir));
  }
  return shown;
}
