/**
 * Shared image-filtering logic used by the background worker (badge count),
 * the popup (visible list) and the download handler, so all three agree on
 * which images are "eligible" for a given set of user settings.
 */

import { ImageInfo, SettingsData, FilterOptions, SizeBucket, SortKey, SortDir, AvailableOptions } from '@mbd/core/types';
import { originalNameFromUrl } from '@mbd/core/collection/download-name';
import { isEmojiUrl } from '@mbd/core/collection/emoji';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { hostFromUrl, registrableDomain } from '@mbd/core/collection/paths';

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

/** Classifies a known-positive largest edge into a size bucket. Callers handle
 *  the edge <= 0 ("unknown dimensions") case themselves — this assumes edge > 0.
 *  Single source of truth for the 256/1024 boundaries shared by inSizeBucket
 *  and knownBucket. */
function edgeToBucket(edge: number): Exclude<SizeBucket, 'all'> {
  if (edge < 256) return 'small';
  if (edge < 1024) return 'medium';
  return 'large';
}

/** Whether an item falls in a dimension-based size bucket. Unknown dims pass. */
function inSizeBucket(item: ImageInfo, bucket: SizeBucket): boolean {
  if (bucket === 'all') return true;
  const edge = Math.max(item.width, item.height);
  if (edge <= 0) return true; // unknown dimensions are never hidden
  return edgeToBucket(edge) === bucket;
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
function compareBy(
  a: ImageInfo,
  b: ImageInfo,
  key: SortKey,
  dir: SortDir,
  nameOf: (i: ImageInfo) => string = itemName,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  if (key === 'name') return sign * nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: 'base' });
  if (key === 'type') return sign * (a.type.localeCompare(b.type) || nameOf(a).localeCompare(nameOf(b)));

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
  /** Canonical-keyed set: a re-signed / re-sized CDN variant of an excluded image
   *  still matches (see SrcKeySet / canonicalSrcKey). */
  urls: SrcKeySet;
  /** Registrable domains (not exact hosts). A "host" exclusion is scoped to the
   *  whole site so it survives rotating edge PoPs — the same image served from
   *  `scontent-del3-1.xx.fbcdn.net` then `scontent-lhr8-2.xx.fbcdn.net` both
   *  reduce to `fbcdn.net`. Build with `registrableDomain` on both sides. */
  hosts: Set<string>;
}

/** Whether a media src is on the user's exclusion blocklist (canonical URL, or
 *  the src's registrable domain — so a host exclusion covers rotating CDN edges). */
export function isExcluded(src: string, m: ExcludedMatchers): boolean {
  if (m.urls.has(src)) return true;
  const domain = registrableDomain(hostFromUrl(src));
  return domain !== '' && m.hosts.has(domain);
}

/** Removes excluded items from a list. */
export function filterExcluded(items: ImageInfo[], m: ExcludedMatchers): ImageInfo[] {
  if (m.urls.size === 0 && m.hosts.size === 0) return items;
  return items.filter((i) => !isExcluded(i.src, m));
}

/** Items that are NOT a real, directly-downloadable file yet: pending videos, pending
 *  images (placeholder src), and HLS streams (captured individually). Every site that
 *  needs to hold back "download all"/selection/network-enrichment from a pending or
 *  stream item should gate on this, rather than re-deriving the three-flag check. */
export const isPendingOrStream = (i: Pick<ImageInfo, 'unresolvedVideo' | 'unresolvedImage' | 'hlsManifest'>): boolean =>
  !!i.unresolvedVideo || !!i.unresolvedImage || !!i.hlsManifest;

/**
 * Applies the toolbar filters (kind, format, size, min-size, base64), the
 * free-text search, and the chosen sort order. Filtering is followed by an
 * optional stable sort; `sortBy: 'default'` preserves collection order.
 */
export function applyToolbarFilters(
  items: ImageInfo[],
  filters: FilterOptions,
  isDownloaded: (item: ImageInfo) => boolean = () => false,
): ImageInfo[] {
  const minBytes = (Number.isFinite(filters.minSize) ? filters.minSize : 0) * 1024;
  // The Type dropdown offers formats for the selected kind — image formats when
  // kind is 'all'. So the format filter applies only to items of that family;
  // otherwise picking 'PNG' with kind 'all' would silently drop every video/audio
  // (whose type is never an image format).
  const typeFamily = filters.mediaKind === 'all' ? 'image' : filters.mediaKind;
  // Near-duplicate visibility (#198). Absent (undefined) behaves as 'unique' so a
  // caller that hasn't adopted the field still hides marked duplicates once a pass
  // has run — but with no pass, nothing is marked, so the default is a no-op.
  const duplicateState = filters.duplicateState ?? 'unique';
  const shown = items.filter((item) => {
    if (duplicateState === 'unique' && item.nearDuplicate) return false;
    if (duplicateState === 'duplicates' && !item.nearDuplicate) return false;
    if (filters.mediaKind !== 'all' && item.kind !== filters.mediaKind) return false;
    if (!inSizeBucket(item, filters.sizeBucket)) return false;
    if (filters.imageType !== 'all' && item.kind === typeFamily && item.type !== filters.imageType) return false;
    if (minBytes > 0 && item.fileSize > 0 && item.fileSize < minBytes) return false;
    if (!filters.includeBase64 && item.isBase64) return false;
    if (filters.downloadState === 'downloaded' && !isDownloaded(item)) return false;
    if (filters.downloadState === 'not-downloaded' && isDownloaded(item)) return false;
    return matchesSearch(item, filters.search ?? '');
  });

  if (filters.sortBy && filters.sortBy !== 'default') {
    const key = filters.sortBy;
    // Memoize each item's parsed filename once for name/type sorts. compareBy
    // otherwise calls itemName -> originalNameFromUrl (a full URL parse + decode +
    // sanitize) inside the comparator, i.e. O(n log n) times — janking the popup's
    // hot per-keystroke filter path on large galleries. Numeric keys don't parse.
    const nameCache =
      key === 'name' || key === 'type' ? new Map(shown.map((i) => [i, itemName(i)])) : undefined;
    const nameOf = nameCache ? (i: ImageInfo) => nameCache.get(i) ?? itemName(i) : itemName;
    // Copy first — sort mutates, and `items` (state) must not be reordered in place.
    return [...shown].sort((a, b) => compareBy(a, b, key, filters.sortDir, nameOf));
  }
  return shown;
}

/** Human labels for canonical `type` strings; a type with no entry falls back to uppercase. */
export const FORMAT_LABELS: Record<string, string> = {
  jpeg: 'JPEG', png: 'PNG', gif: 'GIF', svg: 'SVG', webp: 'WebP',
  avif: 'AVIF', heic: 'HEIC', heif: 'HEIF', jxl: 'JXL',
  mp4: 'MP4', webm: 'WebM', ogg: 'OGG', mov: 'MOV',
  mp3: 'MP3', wav: 'WAV', m4a: 'M4A', flac: 'FLAC',
};

/** Bucket for an item's largest KNOWN edge, or null when dimensions are unknown.
 *  Unlike inSizeBucket, unknown dims (edge <= 0) map to null (→ 'all' only), so a
 *  page of dimensionless items doesn't make every bucket appear present. */
function knownBucket(item: ImageInfo): Exclude<SizeBucket, 'all'> | null {
  const edge = Math.max(item.width, item.height);
  return edge <= 0 ? null : edgeToBucket(edge);
}

/**
 * Derive the filter option lists present in a collected set. Kinds and size
 * buckets come out in canonical order; formats in first-seen order. Each list is
 * prefixed with 'all'. Formats outside FORMAT_LABELS still appear (data-driven);
 * the 'unknown' placeholder type is omitted.
 */
export function deriveFilterOptions(items: ImageInfo[]): AvailableOptions {
  const kinds = new Set<FilterOptions['mediaKind']>();
  const formats: Record<'image' | 'video' | 'audio', Set<string>> = {
    image: new Set(), video: new Set(), audio: new Set(),
  };
  const buckets = new Set<Exclude<SizeBucket, 'all'>>();
  for (const it of items) {
    kinds.add(it.kind);
    if (it.type && it.type !== 'unknown') formats[it.kind].add(it.type);
    const b = knownBucket(it);
    if (b) buckets.add(b);
  }
  const kindOrder: FilterOptions['mediaKind'][] = ['image', 'video', 'audio'];
  const bucketOrder: Exclude<SizeBucket, 'all'>[] = ['small', 'medium', 'large'];
  return {
    kinds: ['all', ...kindOrder.filter((k) => kinds.has(k))],
    formats: {
      image: ['all', ...formats.image],
      video: ['all', ...formats.video],
      audio: ['all', ...formats.audio],
    },
    sizeBuckets: ['all', ...bucketOrder.filter((b) => buckets.has(b))],
  };
}
