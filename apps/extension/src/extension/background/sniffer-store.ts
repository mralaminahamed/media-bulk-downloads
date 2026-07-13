import { ResolveHint, ResolvedMedia } from '@mbd/core/types';
import { resolveOriginal, NetDeps } from '@mbd/core/resolvers/network';
import { mediaIdFromPoster, pinTwimgUrl } from '@mbd/core/resolvers/sniffers/x-media-sniff';
import { retryingFetch } from '@mbd/core/net/retry';

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
 * Caches a Response's `.json()`/`.text()` results so every caller that reads the
 * body gets the SAME parsed value, even though the underlying stream can only be
 * consumed once. Needed because `memoizeFetch` (below) hands the identical
 * in-flight/settled `Response` to multiple callers for the same URL — without
 * this, the second caller's `.json()`/`.text()` would throw ("body already read")
 * or race the first read. Every other property/method (`.ok`, `.status`,
 * `.headers`, `.url`, `.clone()`, …) passes through to the real response
 * untouched, so `resolveOriginal`'s callers see an ordinary `Response`.
 */
function memoizeResponseBody(res: Response): Response {
  let jsonPromise: Promise<unknown> | undefined;
  let textPromise: Promise<string> | undefined;
  return new Proxy(res, {
    get(target, prop) {
      if (prop === 'json') {
        return () => {
          if (!jsonPromise) jsonPromise = target.json();
          return jsonPromise;
        };
      }
      if (prop === 'text') {
        return () => {
          if (!textPromise) textPromise = target.text();
          return textPromise;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Wraps `fetch` so identical request URLs within a single `resolveOriginalsBatch`
 * call share one network request. Several `photo <sid> <n>` hints for the same
 * tweet each build the identical `tweet-result?id=<sid>` URL in `network.ts`'s
 * `twitter()` — without this, N photo hints for one status fire N identical
 * fetches. The cache stores the `Promise<Response>` (not just the eventual
 * value) keyed by request URL, and populates it synchronously before the first
 * `await`, so two hints for the same status processed by different concurrent
 * workers (see below) still land on the same cache entry rather than racing.
 * `network.ts` and `resolveOriginal` are unaware of this — they still receive
 * an ordinary `deps.fetch`.
 */
function memoizeFetch(fetchFn: NetDeps['fetch']): NetDeps['fetch'] {
  const cache = new Map<string, Promise<Response>>();
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const key = String(input);
    let cached = cache.get(key);
    if (!cached) {
      cached = fetchFn(input, init).then(memoizeResponseBody);
      cache.set(key, cached);
    }
    return cached;
  }) as NetDeps['fetch'];
}

/**
 * Resolves each hint to its final URL with bounded concurrency (limit 4).
 * Inline loop — the background service worker can't import the popup's
 * `mapWithConcurrency` helper. Failures are skipped (never throw).
 *
 * For Twitter videos, a real mp4 the page already exposed (`sniffed`, keyed by
 * the poster's media id) wins over a network fetch — it covers age-restricted
 * clips syndication tombstones and avoids a request entirely.
 *
 * `deps.fetch` is wrapped in a per-call memo (`memoizeFetch`) so multiple
 * `photo <sid> <n>` hints for the SAME status — each its own hint, since one
 * tweet can carry several unpainted photo cells — collapse to a single
 * `tweet-result?id=<sid>` fetch instead of one per photo index. Non-twitter
 * hints and hints for distinct ids are unaffected (different URLs, no shared
 * cache entry). The DEFAULT `deps.fetch` is also wrapped in `retryingFetch`,
 * applied BEFORE `memoizeFetch` above wraps it again — so retry runs inside
 * the memo, and several hints sharing one deduped fetch also share its
 * retries — so a transient 429/5xx/network blip on an opt-in
 * original-resolution retries instead of permanently failing the item.
 */
export async function resolveOriginalsBatch(
  hints: { src: string; hint: ResolveHint }[],
  deps: NetDeps = { fetch: retryingFetch((...a) => fetch(...a)) },
  sniffed?: Map<string, ResolvedMedia>,
): Promise<Record<string, ResolvedMedia>> {
  const out: Record<string, ResolvedMedia> = {};
  const batchDeps: NetDeps = { fetch: memoizeFetch(deps.fetch) };
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
      const res = await resolveOriginal(hint, batchDeps);
      if (res) out[src] = res;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, hints.length) }, worker));
  return out;
}
