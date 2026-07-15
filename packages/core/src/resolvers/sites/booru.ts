import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

// Boorus we support, keyed by the PAGE host (the collected media URL is on an
// image CDN, so matching gates on ctx.pageUrl, not u.hostname).
const HOSTS = new Set([
  'danbooru.donmai.us', 'safebooru.donmai.us',
  'gelbooru.com', 'safebooru.org',
  'yande.re', 'konachan.com', 'konachan.net',
  // e621ng (Danbooru fork): reads `data-file-url` off `#image-container`.
  'e621.net', 'e926.net', 'e6ai.net',
  // Gelbooru 0.2 self-hosted: same `#image` + "Original image" `/images/`
  // anchor as gelbooru.com/safebooru.org; originals on the site's own domain.
  'rule34.xxx', 'tbib.org', 'hypnohub.net', 'xbooru.com', 'realbooru.com',
  // Philomena engine (derpibooru/furbooru/ponybooru) + booru-on-rails (twibooru):
  // the full-res URL is the `full` key of an entity-encoded JSON `data-uris`
  // attribute on the media container. Each site uses its own image CDN.
  'derpibooru.org', 'furbooru.org', 'ponybooru.org', 'twibooru.org',
]);

// Allowed original-image host suffixes per page host — the DOM-supplied original
// URL is pinned to these before it becomes a downloadable candidate.
const IMG_HOSTS: Record<string, string[]> = {
  'danbooru.donmai.us': ['donmai.us'],
  'safebooru.donmai.us': ['donmai.us'],
  'gelbooru.com': ['gelbooru.com'],
  'safebooru.org': ['safebooru.org'],
  'yande.re': ['yande.re'],
  'konachan.com': ['konachan.com'],
  'konachan.net': ['konachan.net'],
  // e621ng originals are served on `static1.<host>` (same registrable domain).
  'e621.net': ['e621.net'],
  'e926.net': ['e926.net'],
  'e6ai.net': ['e6ai.net'],
  // Gelbooru 0.2 self-hosts its originals under its own registrable domain
  // (e.g. wimg.rule34.xxx). A wrong pin fails safe: pinnedDomUrl → null → no
  // upgrade, never a broken/off-host URL.
  'rule34.xxx': ['rule34.xxx'],
  'tbib.org': ['tbib.org'],
  'hypnohub.net': ['hypnohub.net'],
  'xbooru.com': ['xbooru.com'],
  'realbooru.com': ['realbooru.com'],
  // Philomena/booru-on-rails CDNs — each on its own registrable domain
  // (verified live 2026-07-15). furbooru serves from furrycdn.org, NOT
  // furbooru.org; a wrong pin fails safe (pinnedDomUrl → null → no upgrade).
  'derpibooru.org': ['derpicdn.net'],
  'furbooru.org': ['furrycdn.org'],
  'ponybooru.org': ['ponybooru.org'],
  'twibooru.org': ['twibooru.org'],
};

/** Reads the `full` (full-resolution) URL from a Philomena `data-uris` JSON blob.
 *  getAttribute returns the HTML-entity-decoded value, so JSON.parse is direct.
 *  Returns null on any parse failure or a missing/non-string `full`. */
function philomenaFull(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const obj = JSON.parse(raw) as { full?: unknown };
    return typeof obj.full === 'string' ? obj.full : null;
  } catch {
    return null;
  }
}

function pageHost(ctx: ResolveContext): string | null {
  try { return new URL(ctx.pageUrl ?? '').hostname.toLowerCase(); } catch { return null; }
}

/** Pin a DOM-supplied URL to https on one of the allowed host suffixes, else null. */
function pinnedDomUrl(url: string | null | undefined, suffixes: string[]): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url, document.baseURI);
    if (u.protocol !== 'https:') return null;
    return suffixes.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`)) ? u.href : null;
  } catch {
    return null;
  }
}

/** Read the true original URL from the DOM, scoped to `el` (never document-wide
 *  for a non-post element). Returns the raw (unpinned) URL, or null. */
function readOriginal(el: Element): string | null {
  // Danbooru: the original lives in a data attribute on the element (post #image)
  // or its grid article — element-scoped, so only real post elements resolve.
  const dan = el.getAttribute?.('data-file-url')
    ?? el.closest?.('[data-file-url]')?.getAttribute?.('data-file-url')
    ?? el.getAttribute?.('data-large-file-url')
    ?? el.closest?.('[data-large-file-url]')?.getAttribute?.('data-large-file-url');
  if (dan) return dan;

  // Philomena / booru-on-rails: the media container wrapping the post/grid image
  // carries a JSON `data-uris`; its `full` key is the full-resolution URL.
  // Element-scoped via closest so a grid thumb resolves its own container.
  const philo = philomenaFull(
    el.getAttribute?.('data-uris') ?? el.closest?.('[data-uris]')?.getAttribute?.('data-uris'),
  );
  if (philo) return philo;

  // Moebooru / Gelbooru / Safebooru: only when THIS element is the main post
  // image; a document-wide read would mis-attach the post's original to an icon.
  if (el.getAttribute?.('id') !== 'image') return null;
  const doc = el.ownerDocument;
  const moe = doc?.querySelector('a.original-file-unchanged, a.highres-show, a#highres')?.getAttribute('href');
  if (moe) return moe;
  const gel = doc?.querySelector('a[href*="/images/"]')?.getAttribute('href');
  return gel ?? null;
}

function kindFromExt(ext: string | null): 'image' | 'video' | 'gif' {
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (ext === 'gif') return 'gif';
  return 'image';
}

export const booruResolver: Resolver = {
  id: 'booru',
  match: (_u, ctx) => {
    const host = pageHost(ctx);
    return host !== null && HOSTS.has(host);
  },
  resolve: (u, ctx): MediaCandidate[] => {
    const el = ctx.el;
    const host = pageHost(ctx);
    if (!el || !host) return [];
    const raw = readOriginal(el);
    const pinned = pinnedDomUrl(raw, IMG_HOSTS[host] ?? []);
    if (!pinned || pinned === u.href) return []; // no original / already the original
    const ext = extensionFromUrl(pinned);
    const c: MediaCandidate = { url: pinned, kind: kindFromExt(ext), thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    // Dims + a stable identity from a Danbooru grid article when present.
    const art = el.closest?.('[data-file-url], [data-large-file-url]');
    const w = Number(art?.getAttribute?.('data-width'));
    const h = Number(art?.getAttribute?.('data-height'));
    if (w > 0 && h > 0) { c.width = w; c.height = h; }
    const id = art?.getAttribute?.('data-id') ?? el.getAttribute?.('data-id') ?? null;
    if (id) c.mediaKey = `booru ${host} ${id}`;
    return [c];
  },
};
