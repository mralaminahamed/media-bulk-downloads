/**
 * Perceptual-hash near-duplicate detection (#198).
 *
 * Classic DCT-based pHash: a 32×32 grayscale image is transformed, the top-left
 * 8×8 low-frequency block is thresholded against the median of its AC coefficients,
 * and the result is a 64-bit fingerprint. Two images whose Hamming distance is
 * within a small threshold are perceptually near-identical (same picture at a
 * different resolution, a re-encode, a CDN variant) even when their bytes and URLs
 * differ — which exact-URL / canonical-key dedup (`canonicalSrcKey`) can't catch.
 *
 * Pure and DOM-free: callers supply a 32×32 grayscale luma array (the extension's
 * worker produces it via OffscreenCanvas). Everything here is unit-testable.
 */

const SIZE = 32;
const LOW = 8;

/**
 * Default Hamming threshold for "near-duplicate" on a 64-bit DCT pHash. A faithful
 * thumbnail-vs-original (registered same framing, different resolution, JPEG
 * re-encode) lands around 4–6 bits apart, while structurally distinct images sit
 * ~30+ apart — so 8 catches resolution/CDN variants with margin while staying far
 * from the distinct-image band. Deliberately more forgiving than a naïve ≤5, which
 * would miss genuine 6-distance pairs. User-tunable via settings.
 */
export const DEFAULT_NEAR_DUP_THRESHOLD = 8;

/** DCT-II basis, precomputed: `cosTable[k][n] = cos(π/SIZE · (n + ½) · k)`. Only
 *  the first LOW output rows are ever needed, so only those are stored. */
const cosTable: readonly (readonly number[])[] = (() => {
  const table: number[][] = [];
  for (let k = 0; k < LOW; k++) {
    const row = new Array<number>(SIZE);
    for (let n = 0; n < SIZE; n++) row[n] = Math.cos((Math.PI / SIZE) * (n + 0.5) * k);
    table.push(row);
  }
  return table;
})();

/**
 * Computes the 64-bit perceptual hash of a 32×32 grayscale image, returned as a
 * 16-char lowercase hex string (MSB-first). Input is row-major luma, 0–255,
 * length exactly 32×32 = 1024.
 */
export function computePHash(gray: readonly number[]): string {
  if (gray.length !== SIZE * SIZE) {
    throw new Error(`computePHash expects ${SIZE * SIZE} samples, got ${gray.length}`);
  }

  const rows: number[][] = [];
  for (let x = 0; x < SIZE; x++) {
    const base = x * SIZE;
    const out = new Array<number>(LOW);
    for (let v = 0; v < LOW; v++) {
      const cv = cosTable[v];
      let s = 0;
      for (let y = 0; y < SIZE; y++) s += gray[base + y] * cv[y];
      out[v] = s;
    }
    rows.push(out);
  }
  const coeffs = new Array<number>(LOW * LOW);
  for (let u = 0; u < LOW; u++) {
    const cu = cosTable[u];
    for (let v = 0; v < LOW; v++) {
      let s = 0;
      for (let x = 0; x < SIZE; x++) s += rows[x][v] * cu[x];
      coeffs[u * LOW + v] = s;
    }
  }

  const ac = coeffs.slice(1).sort((a, b) => a - b);
  const median = ac[(ac.length - 1) / 2];

  let hex = '';
  for (let nib = 0; nib < 16; nib++) {
    let v = 0;
    for (let b = 0; b < 4; b++) v = (v << 1) | (coeffs[nib * 4 + b] > median ? 1 : 0);
    hex += v.toString(16);
  }
  return hex;
}

/** Hamming distance (0–64) between two equal-length hex pHash strings. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('hammingDistance: hash length mismatch');
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/**
 * Complete-linkage clustering: groups items so that EVERY pair within a group is
 * within `threshold` (the group's diameter is bounded by `threshold`). An item
 * joins the first cluster it is within `threshold` of ALL members of, else starts
 * its own. Every item appears in exactly one returned group (singletons included);
 * group order and member order follow first-seen input order, so the result is
 * deterministic.
 *
 * This deliberately does NOT chain transitively the way single linkage does: a
 * gradient/burst sequence whose consecutive frames are near but whose ends are far
 * apart no longer collapses into one group where all but the keeper are hidden from
 * the default "unique" view — the far frames are genuinely distinct images (#198).
 */
export function clusterNearDuplicates<T extends { pHash: string }>(
  items: readonly T[],
  threshold: number,
): T[][] {
  const clusters: T[][] = [];
  for (const item of items) {
    const target = clusters.find((c) => c.every((m) => hammingDistance(item.pHash, m.pHash) <= threshold));
    if (target) target.push(item);
    else clusters.push([item]);
  }
  return clusters;
}

/**
 * Picks the item to KEEP from a near-duplicate cluster: largest pixel area, then
 * largest byte size, then the first (stable) on a full tie. Unknown dimensions
 * count as 0 area, so a sized original always beats a dimensionless variant.
 */
export function pickKeeper<T extends { width?: number; height?: number; fileSize?: number }>(
  cluster: readonly T[],
): T {
  return cluster.reduce((best, cur) => {
    const areaBest = (best.width ?? 0) * (best.height ?? 0);
    const areaCur = (cur.width ?? 0) * (cur.height ?? 0);
    if (areaCur > areaBest) return cur;
    if (areaCur < areaBest) return best;
    return (cur.fileSize ?? 0) > (best.fileSize ?? 0) ? cur : best;
  });
}

/** One item fed to `markNearDuplicates` — its identity plus the size fields that
 *  decide which copy of a cluster is kept. */
export interface DedupInput {
  mediaKey: string;
  pHash: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

/** The per-item verdict: `nearDuplicate` copies are hidden; the group's keeper
 *  stays visible. `duplicateGroupId` is the keeper's `mediaKey`. */
export interface DedupMark {
  nearDuplicate: boolean;
  duplicateGroupId: string;
}

/**
 * Clusters the hashed items and returns a mark for every member of a cluster of
 * size ≥ 2, keyed by `mediaKey`. The keeper of each cluster is marked
 * `nearDuplicate: false`; the rest `true`. Items in no multi-member cluster get
 * no entry (callers treat a missing key as unique).
 */
export function markNearDuplicates(
  items: readonly DedupInput[],
  threshold: number,
): Map<string, DedupMark> {
  const marks = new Map<string, DedupMark>();
  for (const cluster of clusterNearDuplicates(items, threshold)) {
    if (cluster.length < 2) continue;
    const keeper = pickKeeper(cluster);
    const duplicateGroupId = keeper.mediaKey;
    for (const item of cluster) {
      marks.set(item.mediaKey, { nearDuplicate: item !== keeper, duplicateGroupId });
    }
  }
  return marks;
}
