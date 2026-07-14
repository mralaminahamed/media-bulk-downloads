/**
 * Cross-tab media combination (#283).
 *
 * When collecting across several open tabs, each tab's set is already
 * de-duplicated internally, but the same image can appear in multiple tabs — and
 * at different resolutions (a 320px thumbnail in one tab, the 2048px original in
 * another) under the same canonical identity. `dedupeByCanonical` folds those into
 * one row, keeping the largest copy, so the combined grid/ZIP isn't full of the
 * same picture. Distinct near-duplicates at *different* URLs are left alone here;
 * the #198 perceptual-hash pass collapses those on demand.
 *
 * Pure and DOM-free — the collector tags each item with its `sourcePage` before
 * calling this, and the kept copy carries that tag through.
 */

import { ImageInfo } from '@mbd/core/types';
import { canonicalSrcKey } from '@mbd/core/collection/canonical';

/** Whether `candidate` is a bigger rendition than the incumbent `best`: larger
 *  pixel area wins, then larger byte size, else keep the incumbent (first-seen). */
function isLarger(candidate: ImageInfo, best: ImageInfo): boolean {
  const areaC = candidate.width * candidate.height;
  const areaB = best.width * best.height;
  if (areaC !== areaB) return areaC > areaB;
  return candidate.fileSize > best.fileSize;
}

/**
 * De-duplicates a combined multi-tab item list by `canonicalSrcKey`, keeping the
 * largest copy of each identity (area → bytes → first-seen). The kept item holds
 * its own `sourcePage`. Output order follows the first appearance of each identity,
 * so the grid stays stable as later tabs merely upgrade an earlier slot.
 */
export function dedupeByCanonical(items: readonly ImageInfo[]): ImageInfo[] {
  const bestByKey = new Map<string, ImageInfo>();
  const order: string[] = [];
  for (const item of items) {
    const key = canonicalSrcKey(item.src);
    const incumbent = bestByKey.get(key);
    if (!incumbent) {
      bestByKey.set(key, item);
      order.push(key); // fix this identity's slot at its first appearance
    } else if (isLarger(item, incumbent)) {
      bestByKey.set(key, item); // upgrade the value, keep the slot
    }
  }
  return order.map((key) => bestByKey.get(key) as ImageInfo);
}
