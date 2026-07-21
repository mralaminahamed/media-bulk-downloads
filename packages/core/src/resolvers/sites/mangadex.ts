import { MediaCandidate } from '@mbd/core/resolvers/types';
import {
  MangadexMediaEntry,
  mdMediaUrl,
  chapterIdFromPageUrl,
} from '@mbd/core/resolvers/sniffers/mangadex-media-sniff';

const MD_CHAPTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MD_EXT = /^(?:png|jpe?g|gif)$/i;
const SNIFF_CAP = 4000;

let sniffed: MangadexMediaEntry[] = [];

/**
 * Page media read from a sniffed `/at-home/server/` response into the resolver's
 * store. The payload crossed the MAIN→isolated postMessage boundary, so it is
 * UNTRUSTED — re-validate the chapter id, page, and ext, and re-host-pin every
 * URL to the MangaDex CDN here.
 */
export function ingestSniffedMangadexMedia(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  const clean: MangadexMediaEntry[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.chapterId !== 'string' || !MD_CHAPTER_ID.test(e.chapterId)) continue;
    if (typeof e.page !== 'number' || !Number.isInteger(e.page) || e.page < 1) continue;
    if (typeof e.ext !== 'string' || !MD_EXT.test(e.ext)) continue;
    const url = mdMediaUrl(e.url);
    if (!url) continue;
    clean.push({ chapterId: e.chapterId, page: e.page, ext: e.ext.toLowerCase(), url });
  }
  if (!clean.length) return;
  for (const e of clean) sniffed.push(e);
  if (sniffed.length > SNIFF_CAP) sniffed = sniffed.slice(sniffed.length - SNIFF_CAP);
}

/** Test-only: drop all sniffed state so cases start clean. */
export function __resetMangadexSniffed(): void {
  sniffed = [];
}

/** Every sniffed page for the chapter at `pageUrl` (a /chapter/<id> URL), page
 *  order, deduped, or []. */
export function mangadexPageMedia(pageUrl?: string): MediaCandidate[] {
  const chapterId = chapterIdFromPageUrl(pageUrl);
  if (!chapterId) return [];
  const seen = new Set<string>();
  return sniffed
    .filter((e) => e.chapterId === chapterId && (seen.has(e.url) ? false : (seen.add(e.url), true)))
    .sort((a, b) => a.page - b.page)
    .map((e) => ({ url: e.url, kind: 'image', ext: e.ext }));
}
