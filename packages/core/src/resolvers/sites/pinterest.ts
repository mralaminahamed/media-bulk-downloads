import { upgradeToOriginal } from '@mbd/core/collection/imageUrl';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';
import { PinterestMediaEntry, pinPinimgUrl, pinIdFromUrl, PIN_EXT } from '@mbd/core/resolvers/sniffers/pinterest-media-sniff';

const IMG_HOST = 'i.pinimg.com';

// Pin id from the poster's own `/pin/` anchor, else the page url. Reuses
// pinIdFromUrl (the single source of the /pin/<id> pattern) so the DOM path and
// the sniffer path can't drift — both accept a slash/query/hash/end terminator.
function pinIdFrom(el: Element | undefined, pageUrl: string | undefined): string | null {
  const href = el?.closest?.('a[href*="/pin/"]')?.getAttribute('href');
  return pinIdFromUrl(href) ?? pinIdFromUrl(pageUrl);
}

/**
 * True when the poster's pin cell shows a video. Pinterest's authed markup uses
 * obfuscated class names, so only durable, semantic signals are trusted: a
 * `<video>` in the cell, or a `data-test-id` / `aria-label` naming "video". The
 * search is bounded to the cell holding this poster's own `/pin/` link so a
 * neighbouring video pin in a grid can't mark a still pin as video.
 */
function hasVideoSignal(el: Element | undefined): boolean {
  if (!el?.closest) return false;
  const cell = el.closest('a[href*="/pin/"]')?.parentElement ?? el.closest('[data-test-id]') ?? el.parentElement ?? el;
  return !!cell?.querySelector?.('video, [data-test-id*="video" i], [aria-label*="video" i]');
}

// Sniffed /resource/ media accumulates here across the SPA session. Bounded; newest wins.
const SNIFF_CAP = 4000;
let sniffed: PinterestMediaEntry[] = [];
let sniffVersion = 0;
let byPinCache: { key: number; map: Map<string, PinterestMediaEntry[]> } | null = null;

// Pinterest pin ids are long numeric strings; 6 is a loose floor rejecting short board/user/other ids.
const PIN_ID_STRICT = /^\d{6,}$/;

/**
 * Feed media read from a sniffed /resource/ response into the resolver's store.
 * The payload crossed the MAIN→isolated postMessage boundary, so it is UNTRUSTED
 * — re-validate every field and host-pin every URL to the pinimg family here.
 */
export function ingestSniffedPinterestMedia(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  const clean: PinterestMediaEntry[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.pinId !== 'string' || !PIN_ID_STRICT.test(e.pinId)) continue;
    if (e.kind !== 'image' && e.kind !== 'video') continue;
    const url = pinPinimgUrl(e.url);
    if (!url) continue;
    const ext = typeof e.ext === 'string' && PIN_EXT.test(e.ext) ? e.ext.toLowerCase() : e.kind === 'video' ? 'mp4' : 'jpg';
    const entry: PinterestMediaEntry = { pinId: e.pinId, kind: e.kind, url, ext };
    if (typeof e.width === 'number') entry.width = e.width;
    if (typeof e.height === 'number') entry.height = e.height;
    if (e.kind === 'video') {
      const poster = pinPinimgUrl(e.poster);
      if (poster) entry.poster = poster;
    }
    clean.push(entry);
  }
  if (!clean.length) return;
  sniffed.push(...clean);
  if (sniffed.length > SNIFF_CAP) sniffed = sniffed.slice(sniffed.length - SNIFF_CAP);
  sniffVersion++;
  byPinCache = null;
}

/** Test-only: drop all sniffed state + cache so cases start clean. */
export function __resetPinterestSniffed(): void {
  sniffed = [];
  sniffVersion = 0;
  byPinCache = null;
}

function byPin(): Map<string, PinterestMediaEntry[]> {
  if (byPinCache && byPinCache.key === sniffVersion) return byPinCache.map;
  const map = new Map<string, PinterestMediaEntry[]>();
  const seen = new Set<string>();
  for (const e of sniffed) {
    const dedup = `${e.pinId}\n${e.url}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    const list = map.get(e.pinId);
    if (list) list.push(e);
    else map.set(e.pinId, [e]);
  }
  byPinCache = { key: sniffVersion, map };
  return map;
}

function toCandidate(e: PinterestMediaEntry): MediaCandidate {
  const c: MediaCandidate = { url: e.url, kind: e.kind, ext: e.ext };
  if (typeof e.width === 'number') c.width = e.width;
  if (typeof e.height === 'number') c.height = e.height;
  if (e.kind === 'video' && e.poster) c.poster = e.poster;
  if (e.pending) c.unresolvedVideo = true;
  return c;
}

/** Every sniffed media for the pin at `pageUrl` (a /pin/<id>/ URL), or []. */
export function pinterestPageMedia(pageUrl?: string): MediaCandidate[] {
  const id = pinIdFromUrl(pageUrl);
  if (!id) return [];
  const list = byPin().get(id);
  return list ? list.map(toCandidate) : [];
}

/**
 * Pinterest. Owns `i.pinimg.com` so it runs before the generic resolver:
 *  - a still pin → the same size-folder → /originals/ upgrade the generic path
 *    would do (delegated to `upgradeToOriginal`, the single source of truth also
 *    used by the background right-click path);
 *  - a video-pin poster (durable video signal + a recoverable pin id) → a pending
 *    video whose real file (progressive mp4 or HLS master) comes from the opt-in
 *    network tier via the public pin-widget endpoint; the poster still is kept for
 *    preview but never surfaced as the downloadable media.
 * Direct `v(1).pinimg.com` `<video>` sources are already collected by the video
 * pass, so they are intentionally not matched here.
 */
export const pinterestResolver: Resolver = {
  id: 'pinterest',
  hosts: ['pinimg.com'],
  match: (u) => u.hostname === IMG_HOST,
  resolve: (u, ctx): MediaCandidate[] => {
    // A DOM tile whose pin id is already in the sniffed store resolves straight to
    // the sniffed original / real video (network-free), superseding the /originals/
    // upgrade and the opt-in widget path for video. Every slide of a carousel pin
    // is returned (deduped downstream by canonicalSrcKey).
    const sniffedId = pinIdFrom(ctx.el, ctx.pageUrl);
    if (sniffedId) {
      const hit = byPin().get(sniffedId);
      if (hit && hit.length) return hit.map(toCandidate);
    }

    // Pinterest also serves video poster thumbnails under /videos/thumbnails/…;
    // those are stills, handled by the image path below like any other pin image.
    if (hasVideoSignal(ctx.el)) {
      const id = pinIdFrom(ctx.el, ctx.pageUrl);
      // Only claim a video when it is actually resolvable — without a pin id the
      // widget endpoint can't be queried, so fall through and keep the poster as a
      // downloadable image rather than surfacing an undownloadable pending video.
      if (id) {
        return [{
          url: u.href,
          kind: 'video',
          ext: 'mp4',
          poster: u.href,
          unresolvedVideo: true,
          resolveHint: { platform: 'pinterest', id },
        }];
      }
    }

    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    const ext = imageExtFromUrl(original);
    if (ext) c.ext = ext;
    return [c];
  },
};
