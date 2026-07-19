import { MediaCandidate } from '@mbd/core/resolvers/types';

// TikTok serves media from its own signed CDN families (v*-webapp hosts on
// tiktok.com plus the tiktokcdn / tiktokcdn-us edges). Every URL taken from the
// (untrusted) page JSON is pinned to that allowlist before it becomes a candidate.
const TIKTOK_MEDIA_HOSTS = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktok.com'];

function pinTikTok(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    return TIKTOK_MEDIA_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.href : null;
  } catch {
    return null;
  }
}

interface TtPlayAddr { UrlList?: unknown[] }
interface TtBitrate { Bitrate?: number; PlayAddr?: TtPlayAddr }
interface TtImage { imageURL?: { urlList?: unknown[] } }
interface TtVideo { playAddr?: unknown; cover?: unknown; bitrateInfo?: TtBitrate[] }
interface TtItem { id?: unknown; video?: TtVideo; imagePost?: { images?: TtImage[] } }
interface TtUniversal {
  __DEFAULT_SCOPE__?: { 'webapp.video-detail'?: { itemInfo?: { itemStruct?: TtItem } } };
}

/**
 * TikTok (pure core: no DOM, no network). A video-detail page
 * (`tiktok.com/@<user>/video/<id>` or `/photo/<id>`) embeds the item in
 * `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">` under
 * `__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct`; content/collect.ts
 * reads that element's text and passes it here. The URLs TikTok itself signed and
 * shipped are read, never forged/rewritten (passive, like the Instagram/Facebook
 * resolvers):
 *  - a normal video → the highest-`Bitrate` rendition's `PlayAddr.UrlList[0]`
 *    (else the default `playAddr`) as one ready mp4, poster from `cover`;
 *  - a photo-mode ("imagePost") slideshow → one image candidate per slide.
 * Every URL is host-pinned to the TikTok CDN allowlist (the page JSON is
 * untrusted). A private/removed video renders no itemStruct → `[]` (fails closed).
 * The playAddr edges are session/hotlink-bound, so the actual download relies on
 * the browser's own cookies + the #197 Referer opt-in (the tiktok.com page URL as
 * Referer), the same as pximg/Fanbox.
 */
export function tiktokMediaFromJson(text: string | null | undefined): MediaCandidate[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  let root: TtUniversal;
  try {
    root = JSON.parse(text) as TtUniversal;
  } catch {
    return [];
  }
  const item = root?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  if (!item) return [];
  const id = typeof item.id === 'string' && /^\d+$/.test(item.id) ? item.id : null;

  // Photo-mode slideshow: one image per slide.
  const images = item.imagePost?.images;
  if (Array.isArray(images) && images.length) {
    const seen = new Set<string>();
    const out: MediaCandidate[] = [];
    images.forEach((img, i) => {
      const url = pinTikTok((img?.imageURL?.urlList ?? [])[0]);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const c: MediaCandidate = { url, kind: 'image' };
      if (id) c.mediaKey = `tiktok ${id} ${i}`;
      out.push(c);
    });
    return out;
  }

  // Standard video: the highest-bitrate rendition, else the default playAddr.
  const video = item.video;
  if (!video) return [];
  let best: { br: number; url: string } | null = null;
  for (const b of video.bitrateInfo ?? []) {
    const url = pinTikTok((b?.PlayAddr?.UrlList ?? [])[0]);
    if (!url) continue;
    const br = Number(b?.Bitrate) || 0;
    if (!best || br > best.br) best = { br, url };
  }
  const url = best?.url ?? pinTikTok(video.playAddr);
  if (!url) return [];
  const c: MediaCandidate = { url, kind: 'video', ext: 'mp4' };
  if (id) c.mediaKey = `tiktok ${id}`;
  const poster = pinTikTok(video.cover);
  if (poster) c.poster = poster;
  return [c];
}

/**
 * Reads the current TikTok video/photo page's media from the DOM (synchronous,
 * network-free), for `collectMedia`. No-ops off a TikTok item page.
 */
export function tiktokPageMedia(): MediaCandidate[] {
  if (typeof document === 'undefined') return [];
  const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
  return tiktokMediaFromJson(el?.textContent);
}
