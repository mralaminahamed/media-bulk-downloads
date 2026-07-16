import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';
import { FbMediaEntry, pinFbUrl, fbidFromUrl, extractFbMedia } from '@mbd/core/resolvers/sniffers/fb-media-sniff';

/**
 * Facebook resolver. FB serves media from signed CDNs (*.fbcdn.net,
 * *.cdninstagram.com) whose size token is covered by the URL signature, so a
 * thumbnail cannot be rewritten to its original. The page already ships each
 * photo/video's real URL inside its GraphQL responses and hydration JSON,
 * captured by the MAIN-world `fb-media-sniffer` and fed here via
 * `ingestSniffedFbMedia`, plus this module's own read of embedded
 * `<script type="application/json">` hydration blocks.
 *
 * So we never forge a URL: given a tile, we find its owner fbid (from the
 * enclosing photo/video/watch/reel link, else the page URL) and return every
 * media entry known for that fbid — images at full resolution, videos as
 * their real downloadable mp4.
 */

const SNIFF_CAP = 4000;
const FB_EXT = /^(?:jpe?g|png|webp|gif|avif|heic|mp4|mov|webm|m4v)$/i;
let store: FbMediaEntry[] = [];
let version = 0;
let cache: { key: string; byFbid: Map<string, FbMediaEntry[]> } | null = null;

/**
 * Feed media read from a sniffed GraphQL/hydration response into the store.
 * UNTRUSTED — the payload crossed the MAIN→isolated postMessage boundary, so a
 * hostile facebook.com page can forge it. Re-validate + host-pin every field.
 */
export function ingestSniffedFbMedia(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  const clean: FbMediaEntry[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.fbid !== 'string' || !/^\d{1,32}$/.test(e.fbid)) continue;
    if (e.kind !== 'image' && e.kind !== 'video') continue;
    const url = pinFbUrl(e.url);
    if (!url) continue;
    const ext = typeof e.ext === 'string' && FB_EXT.test(e.ext) ? e.ext.toLowerCase() : e.kind === 'video' ? 'mp4' : 'jpg';
    const entry: FbMediaEntry = { fbid: e.fbid, kind: e.kind, url, ext: ext === 'jpeg' ? 'jpg' : ext };
    if (typeof e.width === 'number') entry.width = e.width;
    if (typeof e.height === 'number') entry.height = e.height;
    const poster = pinFbUrl(e.poster);
    if (e.kind === 'video' && poster) entry.poster = poster;
    if (e.pending === true) entry.pending = true;
    clean.push(entry);
  }
  if (!clean.length) return;
  // Build with a loop, not `push(...clean)`: clean can be as large as the untrusted
  // `entries` payload, and spreading it as call args can hit the engine's
  // argument-count limit (RangeError, silently swallowed by the caller's try/catch).
  for (const e of clean) store.push(e);
  if (store.length > SNIFF_CAP) store = store.slice(store.length - SNIFF_CAP);
  version++;
  cache = null;
}

/** Test-only: reset store + cache + parsed-script tracking. */
export function __resetFbResolver(): void {
  store = [];
  version = 0;
  cache = null;
  parsedScripts = new WeakSet<Element>();
}

/**
 * Parse embedded hydration JSON once per script node. FB ships each opened
 * photo/video's real URL inside its own page JSON (in addition to whatever
 * the MAIN-world sniffer captures from GraphQL/api responses), so reading it
 * here means a page reload / first paint already has media resolvable before
 * any network response is sniffed. Embedded blocks are stable once rendered,
 * so a deep scan's repeated calls parse each block exactly once.
 */
function parseHydration(): void {
  document.querySelectorAll('script[type="application/json"]').forEach((s) => {
    if (parsedScripts.has(s)) return;
    parsedScripts.add(s);
    const text = s.textContent || '';
    // Cheap guard: only parse blocks that could carry media.
    if (text.indexOf('fbcdn') === -1 && text.indexOf('playable_url') === -1) return;
    try {
      ingestSniffedFbMedia(extractFbMedia(JSON.parse(text)));
    } catch {
      /* not JSON / not ours — ignore */
    }
  });
}
let parsedScripts = new WeakSet<Element>();

function buildByFbid(): Map<string, FbMediaEntry[]> {
  parseHydration();
  const key = String(version);
  if (cache && cache.key === key) return cache.byFbid;
  const byFbid = new Map<string, FbMediaEntry[]>();
  for (const e of store) {
    const list = byFbid.get(e.fbid);
    if (list) list.push(e);
    else byFbid.set(e.fbid, [e]);
  }
  cache = { key, byFbid };
  return byFbid;
}

function toCandidate(e: FbMediaEntry): MediaCandidate {
  const c: MediaCandidate = { url: e.url, kind: e.kind, ext: e.ext };
  if (typeof e.width === 'number') c.width = e.width;
  if (typeof e.height === 'number') c.height = e.height;
  if (e.kind === 'video' && e.poster) c.poster = e.poster;
  if (e.pending) c.unresolvedVideo = true;
  return c;
}

/**
 * Once a video's real playable URL has been seen (a resolved video for its
 * fbid), drop the pending cover-only entry for that same fbid so the tile is
 * downloadable rather than stuck "not fetched". Entries here all share one fbid.
 */
function preferResolved(entries: FbMediaEntry[]): FbMediaEntry[] {
  const hasReal = entries.some((e) => e.kind === 'video' && !e.pending);
  return hasReal ? entries.filter((e) => !(e.kind === 'video' && e.pending)) : entries;
}

/**
 * Collapse the raw store entries for one fbid into what should actually
 * surface. Unlike `keepLargestImagePerFbid` in fb-media-sniff.ts (which only
 * dedupes within a single `extractFbMedia` walk), this runs over everything
 * ever ingested for the fbid: on facebook.com the grid thumbnail (small) and
 * the photo-open original (large) arrive in SEPARATE responses, so both
 * persist in the store and both would otherwise surface even though FB is one
 * fbid = one photo.
 *
 *  1. FR2 — a video's cover node is walked and emitted as a standalone image
 *     entry too, so first drop any image whose url equals a video's poster in
 *     this group (before largest-image selection, so the poster can never win).
 *  2. FR1 — keep only the largest remaining image by width*height (missing
 *     width/height counts as area 0); ties keep the LAST (newest-ingested) one,
 *     matching the store's existing newest-wins eviction behavior. All videos
 *     are always kept, pending or resolved.
 *  3. Then apply the existing pending-video collapse (`preferResolved`).
 *
 * Shared by facebookResolver.resolve and facebookPageMedia so the rule lives once.
 */
function collapseFbidGroup(entries: FbMediaEntry[]): FbMediaEntry[] {
  const posterUrls = new Set<string>();
  for (const e of entries) if (e.kind === 'video' && e.poster) posterUrls.add(e.poster);

  const videos: FbMediaEntry[] = [];
  let bestImage: FbMediaEntry | undefined;
  for (const e of entries) {
    if (e.kind === 'video') {
      videos.push(e);
      continue;
    }
    if (posterUrls.has(e.url)) continue; // FR2: a video's poster isn't a standalone photo
    const area = (e.width ?? 0) * (e.height ?? 0);
    const bestArea = bestImage ? (bestImage.width ?? 0) * (bestImage.height ?? 0) : -1;
    if (!bestImage || area >= bestArea) bestImage = e; // FR1: largest wins; ties keep the newest
  }

  return preferResolved(bestImage ? [...videos, bestImage] : videos);
}

const FB_CDN = /(?:^|\.)(?:fbcdn\.net|cdninstagram\.com)$/i;
const onFacebook = (): boolean => {
  const h = location.hostname;
  return h === 'facebook.com' || h.endsWith('.facebook.com');
};

function fbidFromContext(ctx: ResolveContext): string | null {
  const link = ctx.el?.closest?.('a[href*="fbid="], a[href*="/photo/"], a[href*="/photos/"], a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]');
  const fromLink = fbidFromUrl(link?.getAttribute('href'));
  if (fromLink) return fromLink;
  return fbidFromUrl(ctx.pageUrl);
}

/** Candidates for one fbid, each with a mediaKey. A single media keeps the bare
 *  `fb:<fbid>` identity so a later-sniffed original upgrade-replaces the unresolved
 *  placeholder row. When one fbid legitimately carries MORE than one distinct media
 *  (a video plus a separate non-poster image), each gets a per-entry key so the
 *  deep-scan merge — which dedups by mediaKey — doesn't collapse them last-wins and
 *  silently drop one. */
function keyedFbidCandidates(entries: Parameters<typeof collapseFbidGroup>[0], key: string): MediaCandidate[] {
  const group = collapseFbidGroup(entries);
  return group.map((e, i) => ({ ...toCandidate(e), mediaKey: group.length === 1 ? key : `${key}#${i}` }));
}

export const facebookResolver: Resolver = {
  id: 'facebook',
  hosts: ['fbcdn.net', 'cdninstagram.com'],
  match: (u) => onFacebook() && FB_CDN.test(u.hostname),
  resolve: (u, ctx): MediaCandidate[] => {
    const fbid = fbidFromContext(ctx);
    if (!fbid) return [];
    const key = `fb:${fbid}`;
    const entries = buildByFbid().get(fbid);
    if (entries && entries.length) return keyedFbidCandidates(entries, key);
    // No original sniffed yet: surface the tile's own src (as the generic fallback
    // would) but TAGGED with the photo identity, so when the original later lands
    // the deep-scan merge upgrade-replaces this row instead of adding a duplicate.
    return [{ url: u.href, kind: 'image', mediaKey: key }];
  },
};

/** Full media for the opened photo/video (from pageUrl), or [] off such a page. */
export function facebookPageMedia(pageUrl?: string): MediaCandidate[] {
  const fbid = fbidFromUrl(pageUrl);
  if (!fbid) return [];
  const key = `fb:${fbid}`;
  const entries = buildByFbid().get(fbid);
  return entries ? keyedFbidCandidates(entries, key) : [];
}
