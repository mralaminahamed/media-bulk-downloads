import { Resolver } from '../types';
import { FbMediaEntry, pinFbUrl } from '@/extension/shared/resolvers/sniffers/fb-media-sniff';

/**
 * Facebook resolver. FB serves media from signed CDNs (*.fbcdn.net,
 * *.cdninstagram.com) whose size token is covered by the URL signature, so a
 * thumbnail cannot be rewritten to its original. The page already ships each
 * photo/video's real URL inside its GraphQL responses and hydration JSON,
 * captured by the MAIN-world `fb-media-sniffer` and fed here via
 * `ingestSniffedFbMedia`.
 *
 * This module currently implements only the validated sniff store — matching
 * a tile to its owner fbid and returning candidates lands in a follow-up task.
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
  store.push(...clean);
  if (store.length > SNIFF_CAP) store = store.slice(store.length - SNIFF_CAP);
  version++;
  cache = null;
}

/** Test-only: reset store + cache. */
export function __resetFbResolver(): void {
  store = [];
  version = 0;
  cache = null;
}

/** Test-only: current store size, so ingest tests can assert growth/rejection
 *  without depending on the (not-yet-implemented) resolve/match logic. */
export function __storeSize(): number {
  return store.length;
}

/**
 * Stub — match/resolve land in a follow-up task once the store above is
 * grouped by fbid and wired to a tile's enclosing photo/video link. Returning
 * `false`/`[]` unconditionally means this resolver never claims a candidate
 * yet, so the generic resolver keeps handling Facebook media until then.
 */
export const facebookResolver: Resolver = {
  id: 'facebook',
  match: () => false,
  resolve: () => [],
};
