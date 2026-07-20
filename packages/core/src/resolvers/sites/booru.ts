import { extensionFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';

const HOSTS = new Set([
  'danbooru.donmai.us', 'safebooru.donmai.us',
  'gelbooru.com', 'safebooru.org',
  'yande.re', 'konachan.com', 'konachan.net',
  'e621.net', 'e926.net', 'e6ai.net',
  'rule34.xxx', 'tbib.org', 'hypnohub.net', 'xbooru.com', 'realbooru.com',
  'derpibooru.org', 'furbooru.org', 'ponybooru.org', 'twibooru.org',
  'www.sakugabooru.com', 'sakugabooru.com',
]);

const IMG_HOSTS: Record<string, string[]> = {
  'danbooru.donmai.us': ['donmai.us'],
  'safebooru.donmai.us': ['donmai.us'],
  'gelbooru.com': ['gelbooru.com'],
  'safebooru.org': ['safebooru.org'],
  'yande.re': ['yande.re'],
  'konachan.com': ['konachan.com'],
  'konachan.net': ['konachan.net'],
  'e621.net': ['e621.net'],
  'e926.net': ['e926.net'],
  'e6ai.net': ['e6ai.net'],
  'rule34.xxx': ['rule34.xxx'],
  'tbib.org': ['tbib.org'],
  'hypnohub.net': ['hypnohub.net'],
  'xbooru.com': ['xbooru.com'],
  'realbooru.com': ['realbooru.com'],
  'derpibooru.org': ['derpicdn.net'],
  'furbooru.org': ['furrycdn.org'],
  'ponybooru.org': ['ponybooru.org'],
  'twibooru.org': ['twibooru.org'],
  'www.sakugabooru.com': ['sakugabooru.com'],
  'sakugabooru.com': ['sakugabooru.com'],
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
  const dan = el.getAttribute?.('data-file-url')
    ?? el.closest?.('[data-file-url]')?.getAttribute?.('data-file-url')
    ?? el.getAttribute?.('data-large-file-url')
    ?? el.closest?.('[data-large-file-url]')?.getAttribute?.('data-large-file-url');
  if (dan) return dan;

  const philo = philomenaFull(
    el.getAttribute?.('data-uris') ?? el.closest?.('[data-uris]')?.getAttribute?.('data-uris'),
  );
  if (philo) return philo;

  if (el.getAttribute?.('id') !== 'image') return null;
  const doc = el.ownerDocument;
  const moe = doc?.querySelector(
    'a.original-file-unchanged, a.original-file-changed, a.highres-show, a#highres',
  )?.getAttribute('href');
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
    if (!pinned || pinned === u.href) return [];
    const ext = extensionFromUrl(pinned);
    const c: MediaCandidate = { url: pinned, kind: kindFromExt(ext), thumbnailSrc: u.href };
    if (ext) c.ext = ext;
    const art = el.closest?.('[data-file-url], [data-large-file-url]');
    const w = Number(art?.getAttribute?.('data-width'));
    const h = Number(art?.getAttribute?.('data-height'));
    if (w > 0 && h > 0) { c.width = w; c.height = h; }
    const id = art?.getAttribute?.('data-id') ?? el.getAttribute?.('data-id') ?? null;
    if (id) c.mediaKey = `booru ${host} ${id}`;
    return [c];
  },
};
