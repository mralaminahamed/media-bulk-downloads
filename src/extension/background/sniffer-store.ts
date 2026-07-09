import { ResolveHint, ResolvedMedia } from '@/types';
import { resolveOriginal, NetDeps } from '../shared/resolvers/network';
import { mediaIdFromPoster, pinTwimgUrl } from '../shared/resolvers/sniffers/x-media-sniff';

/**
 * Real mp4/HLS media the page's own GraphQL responses exposed, per tab
 * (`mediaId -> ResolvedMedia`). Filled passively by the MAIN-world sniffer (see
 * `x-media-sniffer.content.ts`), consumed sniffer-first when resolving Twitter
 * videos so age-restricted clips the user can see resolve without any forged
 * request. In-memory, bounded, dropped when the tab closes.
 */
export const snifferByTab = new Map<number, Map<string, ResolvedMedia>>();
const SNIFF_CAP_PER_TAB = 800;

/** Merge sniffed `[mediaId, ResolvedMedia]` pairs for a tab; the content script is
 *  untrusted, so this RE-PINS the sniffed `.url` (the real trust boundary) and
 *  caps defensively. */
export function storeSniffedMedia(tabId: number, pairs: unknown): void {
  if (!Array.isArray(pairs)) return;
  let map = snifferByTab.get(tabId);
  if (!map) {
    map = new Map();
    snifferByTab.set(tabId, map);
  }
  for (const pair of pairs) {
    if (!Array.isArray(pair)) continue;
    const [mid, media] = pair;
    if (typeof mid !== 'string' || !media || typeof media !== 'object') continue;
    const pinned = pinTwimgUrl((media as ResolvedMedia).url);
    if (!pinned) continue;
    const value: ResolvedMedia = (media as ResolvedMedia).hls ? { url: pinned, hls: true } : { url: pinned };
    // Always record: updating an existing id with a better variant must not be
    // blocked by the cap, and a new id past the cap evicts the OLDEST entry
    // (Map keeps insertion order) so a long session keeps its most recent clips
    // rather than freezing on the first 800 seen.
    if (!map.has(mid) && map.size >= SNIFF_CAP_PER_TAB) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(mid, value);
  }
}

/**
 * Resolves each hint to its final URL with bounded concurrency (limit 4).
 * Inline loop — the background service worker can't import the popup's
 * `mapWithConcurrency` helper. Failures are skipped (never throw).
 *
 * For Twitter videos, a real mp4 the page already exposed (`sniffed`, keyed by
 * the poster's media id) wins over a network fetch — it covers age-restricted
 * clips syndication tombstones and avoids a request entirely.
 */
export async function resolveOriginalsBatch(
  hints: { src: string; hint: ResolveHint }[],
  deps: NetDeps = { fetch: (...a) => fetch(...a) },
  sniffed?: Map<string, ResolvedMedia>,
): Promise<Record<string, ResolvedMedia>> {
  const out: Record<string, ResolvedMedia> = {};
  const limit = 4;
  let i = 0;
  async function worker() {
    while (i < hints.length) {
      const { src, hint } = hints[i++];
      let sniffedMedia: ResolvedMedia | undefined;
      if (hint.platform === 'twitter' && sniffed) {
        const mid = mediaIdFromPoster(src);
        if (mid) sniffedMedia = sniffed.get(mid);
      }
      if (sniffedMedia) { out[src] = sniffedMedia; continue; }
      const res = await resolveOriginal(hint, deps);
      if (res) out[src] = res;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, hints.length) }, worker));
  return out;
}
