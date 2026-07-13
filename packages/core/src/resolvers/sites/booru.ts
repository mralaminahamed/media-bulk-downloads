import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver, ResolveContext } from '../types';

// Boorus we support, keyed by the PAGE host (the collected media URL is on an
// image CDN, so matching gates on ctx.pageUrl, not u.hostname).
const HOSTS = new Set([
  'danbooru.donmai.us', 'safebooru.donmai.us',
  'gelbooru.com', 'safebooru.org',
  'yande.re', 'konachan.com', 'konachan.net',
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
};

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
