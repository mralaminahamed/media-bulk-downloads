import { MediaCandidate, Resolver, ResolveContext } from './types';
import { IgMediaEntry, extractIgMedia, shortcodeFromUrl, pinIgUrl } from '@/extension/shared/ig-media-sniff';

/**
 * Instagram resolver. Instagram serves images/videos from signed CDNs
 * (`*.cdninstagram.com`, `*.fbcdn.net`) whose `stp` size token is covered by the
 * `oh` signature — rewriting a thumbnail to a bigger size returns 403. But the
 * page ships every post's full media graph (largest `image_versions2.candidates`
 * and real `video_versions` mp4s) inside its own `<script type="application/json">`
 * hydration, and in the GraphQL/api responses it fetches on scroll (captured by
 * the MAIN-world `ig-media-sniffer` and fed here via `ingestSniffedIgMedia`).
 *
 * So we never forge a URL: given a grid/opened-post thumbnail, we find its post
 * shortcode (from the enclosing `/p|reel|tv/<code>` link, else the page URL) and
 * return every slide of that post — images at full resolution, videos as their
 * real downloadable mp4. Anything without a resolvable post code (avatars, UI
 * chrome) returns `[]` so the generic resolver handles it as before.
 */

const IG_CDN = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/;

// Sniffed GraphQL/api media accumulates here across the session (SPA navigation
// keeps the content script alive). Bounded; newest wins.
const SNIFF_CAP = 4000;
let sniffed: IgMediaEntry[] = [];

// Media parsed from embedded `<script>` JSON, accumulated across calls. Each
// script node is parsed exactly once (tracked in `parsedScripts`) so a deep scan
// re-running collectMedia every scroll round never re-parses the same blocks.
let parsed: IgMediaEntry[] = [];
let parsedScripts = new WeakSet<Element>();

// `parsed` + `sniffed` grouped by shortcode. Regrouped only when either grows.
let cache: { key: string; byCode: Map<string, IgMediaEntry[]> } | null = null;

const SHORTCODE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Feed media read from a sniffed GraphQL/api response into the resolver's store
 * (deduped downstream by url). The payload arrives across the MAIN→isolated
 * postMessage boundary, so it is UNTRUSTED — a malicious instagram.com page can
 * forge the envelope. Re-validate every field and host-pin every URL here; never
 * store an entry whose url isn't an https Instagram/Facebook CDN URL.
 */
export function ingestSniffedIgMedia(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  const clean: IgMediaEntry[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.code !== 'string' || !SHORTCODE.test(e.code)) continue;
    if (e.kind !== 'image' && e.kind !== 'video') continue;
    const url = pinIgUrl(e.url);
    if (!url) continue;
    const entry: IgMediaEntry = { code: e.code, kind: e.kind, url, ext: typeof e.ext === 'string' ? e.ext : e.kind === 'video' ? 'mp4' : 'jpg' };
    if (typeof e.width === 'number') entry.width = e.width;
    if (typeof e.height === 'number') entry.height = e.height;
    const poster = pinIgUrl(e.poster);
    if (e.kind === 'video' && poster) entry.poster = poster;
    clean.push(entry);
  }
  if (!clean.length) return;
  sniffed.push(...clean);
  if (sniffed.length > SNIFF_CAP) sniffed = sniffed.slice(sniffed.length - SNIFF_CAP);
  cache = null;
}

/** Test-only: drop all parsed/sniffed state + cache so cases start clean. */
export function __resetIgResolver(): void {
  sniffed = [];
  parsed = [];
  parsedScripts = new WeakSet<Element>();
  cache = null;
}

function buildByCode(): Map<string, IgMediaEntry[]> {
  // Parse only script nodes not seen before — embedded blocks are stable, so a
  // deep scan's repeated collectMedia calls parse each block once.
  document.querySelectorAll('script[type="application/json"]').forEach((s) => {
    if (parsedScripts.has(s)) return;
    parsedScripts.add(s);
    const text = s.textContent || '';
    // Cheap guard: only parse blocks that could carry media.
    if (text.indexOf('image_versions2') === -1 && text.indexOf('video_versions') === -1) return;
    try {
      parsed.push(...extractIgMedia(JSON.parse(text)));
    } catch {
      /* not JSON / not ours — ignore */
    }
  });

  const key = `${parsed.length}|${sniffed.length}`;
  if (cache && cache.key === key) return cache.byCode;

  const byCode = new Map<string, IgMediaEntry[]>();
  const seen = new Set<string>();
  for (const e of parsed.length ? [...parsed, ...sniffed] : sniffed) {
    const dedup = `${e.code}\n${e.url}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    const list = byCode.get(e.code);
    if (list) list.push(e);
    else byCode.set(e.code, [e]);
  }
  cache = { key, byCode };
  return byCode;
}

function codeFromContext(ctx: ResolveContext): string | null {
  const link = ctx.el?.closest?.('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]');
  const fromLink = shortcodeFromUrl(link?.getAttribute('href'));
  if (fromLink) return fromLink;
  return shortcodeFromUrl(ctx.pageUrl);
}

function toCandidate(e: IgMediaEntry): MediaCandidate {
  const cand: MediaCandidate = { url: e.url, kind: e.kind, ext: e.ext };
  if (typeof e.width === 'number') cand.width = e.width;
  if (typeof e.height === 'number') cand.height = e.height;
  if (e.kind === 'video' && e.poster) cand.poster = e.poster;
  return cand;
}

export const instagramResolver: Resolver = {
  id: 'instagram',
  match: (u) => IG_CDN.test(u.hostname),
  resolve: (_u, ctx): MediaCandidate[] => {
    const code = codeFromContext(ctx);
    if (!code) return [];
    const entries = buildByCode().get(code);
    if (!entries || !entries.length) return [];
    return entries.map(toCandidate);
  },
};

/**
 * Every media candidate for the post/reel a single-post page is showing (from
 * `pageUrl`), or `[]` off a post page (a profile grid has no shortcode). Lets
 * `collectMedia` surface an opened post fully even when the DOM hides it — a
 * reel's real `<video>` is a `blob:` (undownloadable) and its poster may be a
 * `<video poster>` attribute with no `<img>` to trigger the per-element path;
 * carousel slides are virtualized. Deduped downstream by url against the DOM walk.
 */
export function instagramPageMedia(pageUrl?: string): MediaCandidate[] {
  const code = shortcodeFromUrl(pageUrl);
  if (!code) return [];
  const entries = buildByCode().get(code);
  return entries ? entries.map(toCandidate) : [];
}
