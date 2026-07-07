/**
 * Pure helpers for the X/Twitter video sniffer. The MAIN-world content script and
 * the background store both import these; nothing here touches the DOM, `chrome.*`,
 * or the network, so it is unit-testable and safe to run in the page realm.
 *
 * Strategy: X's own GraphQL/timeline responses carry each video's real renditions
 * in `video_info.variants[]`, keyed by the media object's `id_str` — the same
 * number that appears in the poster path (`amplify_video_thumb/<id>`). We read
 * those responses passively and map media id → the highest-bitrate progressive
 * mp4, or, when a media object has no mp4 variant, its `application/x-mpegURL`
 * (HLS) master as a capturable stream (`{ url, hls: true }`).
 */

import { ResolvedMedia } from '@/types';

/** Media id from a Twitter video poster / media URL, or null. */
export function mediaIdFromPoster(url: string): string | null {
  return url.match(/\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/(\d+)/)?.[1] ?? null;
}

/**
 * A URL from an API response is untrusted — return it only if it is an https
 * `twimg.com` URL, else null. Used before storing or downloading a sniffed mp4.
 */
export function pinTwimgUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'twimg.com' || u.hostname.endsWith('.twimg.com')) ? u.href : null;
  } catch {
    return null;
  }
}

interface Variant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}

/** Highest-bitrate `video/mp4` variant URL (twimg-pinned), or null. */
export function bestMp4(variants: unknown): string | null {
  if (!Array.isArray(variants)) return null;
  let best: { bitrate: number; url: string } | null = null;
  for (const v of variants as Variant[]) {
    if (v?.content_type !== 'video/mp4') continue;
    const url = pinTwimgUrl(v.url);
    if (!url) continue;
    const bitrate = Number(v.bitrate) || 0;
    if (!best || bitrate > best.bitrate) best = { bitrate, url };
  }
  return best?.url ?? null;
}

/** First `application/x-mpegURL` (HLS) variant URL (twimg-pinned), or null. */
export function bestHls(variants: unknown): string | null {
  if (!Array.isArray(variants)) return null;
  for (const v of variants as Variant[]) {
    if (v?.content_type !== 'application/x-mpegURL') continue;
    const url = pinTwimgUrl(v.url);
    if (url) return url;
  }
  return null;
}

const asStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Deep-walk an API JSON response and return `[mediaId, ResolvedMedia]` pairs for
 * every media object that carries `video_info.variants`. Prefers the best mp4
 * (`{ url }`); a media object with no mp4 variant falls back to its
 * `application/x-mpegURL` master (`{ url, hls: true }`), a capturable stream.
 * Pure and defensive: never throws, bounded step count, first media per id wins.
 * The media id is the object's `id_str` / `media_id_str`, else parsed from its
 * `media_url_https`.
 */
export function extractVideoPairs(root: unknown): [string, ResolvedMedia][] {
  const out: [string, ResolvedMedia][] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [root];
  let steps = 0;
  while (stack.length && steps++ < 200000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;
    const vi = obj.video_info as { variants?: unknown } | undefined;
    if (vi && vi.variants) {
      const mid =
        asStr(obj.id_str) ??
        asStr(obj.media_id_str) ??
        (asStr(obj.media_url_https) ? mediaIdFromPoster(obj.media_url_https as string) : null);
      const mp4 = bestMp4(vi.variants);
      const hls = mp4 ? null : bestHls(vi.variants);
      const media: ResolvedMedia | null = mp4 ? { url: mp4 } : hls ? { url: hls, hls: true } : null;
      if (mid && media && !seen.has(mid)) {
        seen.add(mid);
        out.push([mid, media]);
      }
    }
    for (const k in obj) {
      const val = obj[k];
      if (val && typeof val === 'object') stack.push(val);
    }
  }
  return out;
}
