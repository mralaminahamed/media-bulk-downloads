import { canonicalSrcKey } from '@mbd/core/collection/canonical';
import type { ImageInfo } from '@mbd/core/types';

/** Cross-scan identity: a resolver-supplied `mediaKey` (shared by a photo's
 *  thumbnail and its original) when present, else the canonical src key.
 *  Exported so deep-scan's own round-to-round accumulation dedups on the same
 *  identity this merge uses (structural param → accepts ImageInfo or MediaItem). */
export const identity = (m: { mediaKey?: string; src: string }): string => m.mediaKey ?? canonicalSrcKey(m.src);

/**
 * Merge a fresh deep-scan result into the already-collected set.
 * - A genuinely new identity is appended after the existing items.
 * - When a freshly-scanned item repeats an EXISTING identity via `mediaKey`
 *   (same underlying media, re-resolved), the fresh item REPLACES the old one in
 *   its original slot — this upgrades a Facebook grid thumbnail to the original
 *   that arrived on the sniffer after the first scan (and a reel cover to its
 *   resolved video).
 * - A plain canonical-src repeat (a rotating CDN edge host re-serving the same
 *   image, no `mediaKey`) keeps the FIRST occurrence — today's dedup, unchanged.
 */
export function mergeScannedMedia(existing: ImageInfo[], found: ImageInfo[]): ImageInfo[] {
  const byId = new Map<string, ImageInfo>();
  const order: string[] = [];
  const put = (m: ImageInfo, replace: boolean): void => {
    const id = identity(m);
    if (!byId.has(id)) order.push(id);
    else if (!replace) return;
    byId.set(id, m);
  };
  existing.forEach((m) => put(m, false));
  found.forEach((m) => put(m, !!m.mediaKey));
  return order.map((id) => byId.get(id) as ImageInfo);
}
