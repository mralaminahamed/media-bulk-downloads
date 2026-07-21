/**
 * Pure helpers for the MangaDex resolver + sniffer. Nothing here touches the DOM,
 * `chrome.*`, or the network, so it is unit-testable and safe to run in the page
 * realm (the MAIN-world sniffer imports it too).
 *
 * A MangaDex chapter reader is a pure SPA: to render, it fetches its own public
 * `GET /at-home/server/<chapterId>` and gets back `{ baseUrl, chapter: { hash,
 * data[], dataSaver[] } }`, from which each page's URL is
 * `<baseUrl>/data/<hash>/<file>` (full PNG) or `/data-saver/` (compressed JPG).
 * We read the response the reader already fetched — never forge a request — and
 * turn one chapter into one candidate per page. Full `data` beats `dataSaver`
 * (~9× the bytes). Keyed by the chapter id from the request URL.
 */

export interface MangadexMediaEntry {
  chapterId: string;
  page: number;
  ext: string;
  url: string;
}

const MD_MEDIA_HOST = /(?:^|\.)mangadex\.network$/i;
const MD_CHAPTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MD_HASH = /^[0-9a-f]{16,64}$/i;
const MD_FILE = /^[\w-]+\.(png|jpe?g|gif)$/i;

export const MANGADEX_MATCHES: string[] = ['*://*.mangadex.org/*'];

/** True when `host` is mangadex.org or a subdomain of it. */
export function isMangadexHost(host: string): boolean {
  return host === 'mangadex.org' || host.endsWith('.mangadex.org');
}

/** A URL from page JSON is untrusted — return it only if it is an https URL on
 *  the MangaDex media CDN (`uploads.mangadex.org` or a `*.mangadex.network`
 *  node), else null. Used before every candidate. */
export function mdMediaUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return u.hostname === 'uploads.mangadex.org' || MD_MEDIA_HOST.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** The chapter UUID from an `/at-home/server/<id>` request URL, or null. */
export function chapterIdFromAtHomeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const id = url.match(/\/at-home\/server\/([0-9a-f-]{36})(?:[/?#]|$)/i)?.[1];
  return id && MD_CHAPTER_ID.test(id) ? id : null;
}

/** The chapter UUID from a `/chapter/<id>` reader page URL, or null. */
export function chapterIdFromPageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const id = url.match(/\/chapter\/([0-9a-f-]{36})(?:[/?#]|$)/i)?.[1];
  return id && MD_CHAPTER_ID.test(id) ? id : null;
}

function baseUrlOf(root: Record<string, unknown>): string | null {
  const raw = typeof root.baseUrl === 'string' ? root.baseUrl.replace(/\/+$/, '') : null;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    return u.hostname === 'uploads.mangadex.org' || MD_MEDIA_HOST.test(u.hostname) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Turn one at-home response body into a page-ordered candidate list for the given
 * chapter. Pure and defensive: never throws, host-pins the base, shape-validates
 * the hash and every filename, and prefers full `data` (falling back to
 * `dataSaver` only when `data` is empty).
 */
export function extractMangadexMedia(root: unknown, chapterId: string): MangadexMediaEntry[] {
  if (!MD_CHAPTER_ID.test(chapterId) || !root || typeof root !== 'object') return [];
  const obj = root as Record<string, unknown>;
  const base = baseUrlOf(obj);
  const chapter = obj.chapter;
  if (!base || !chapter || typeof chapter !== 'object') return [];
  const c = chapter as Record<string, unknown>;
  const hash = typeof c.hash === 'string' ? c.hash : '';
  if (!MD_HASH.test(hash)) return [];

  const full = Array.isArray(c.data) ? c.data : [];
  const saver = Array.isArray(c.dataSaver) ? c.dataSaver : [];
  const useSaver = full.length === 0;
  const files = useSaver ? saver : full;
  const dir = useSaver ? 'data-saver' : 'data';

  const out: MangadexMediaEntry[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (typeof file !== 'string' || !MD_FILE.test(file)) continue;
    const url = mdMediaUrl(`${base}/${dir}/${hash}/${file}`);
    if (!url) continue;
    out.push({ chapterId, page: i + 1, ext: file.split('.').pop()!.toLowerCase(), url });
  }
  return out;
}
