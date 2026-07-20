import { MediaCandidate } from '@mbd/core/resolvers/types';

function pinTenor(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /^media\d*\.tenor\.com$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

const FORMAT_PRIORITY: Array<{ key: string; kind: 'gif' | 'video'; ext: string }> = [
  { key: 'gif', kind: 'gif', ext: 'gif' },
  { key: 'mp4', kind: 'video', ext: 'mp4' },
  { key: 'webm', kind: 'video', ext: 'webm' },
];

interface TenorFormat {
  url?: unknown;
}
interface TenorEntry {
  media_formats?: Record<string, TenorFormat>;
  results?: Array<{ media_formats?: Record<string, TenorFormat> }>;
}
interface TenorCache {
  gifs?: { byId?: Record<string, TenorEntry> };
}

/** The numeric id from a Tenor view URL (`/view/<slug>-<id>`), or null. */
export function tenorViewId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!/(?:^|\.)tenor\.com$/i.test(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/\/view\/[^/?#]*?-(\d+)(?:[/?#]|$)/)?.[1] ?? null;
}

/**
 * Extract a Tenor view page's original from its `store-cache` JSON (network-free).
 * `gifs.byId[<id>]` holds the item's `media_formats`; the animated GIF is preferred,
 * then the muxed mp4/webm. The chosen URL is pinned to media*.tenor.com (the JSON is
 * untrusted). An id with no cached entry → `[]` (fails closed).
 */
export function tenorMediaFromCache(text: string | null | undefined, id: string): MediaCandidate[] {
  if (typeof text !== 'string' || !text.trim() || !/^\d+$/.test(id)) return [];
  let cache: TenorCache;
  try {
    cache = JSON.parse(text) as TenorCache;
  } catch {
    return [];
  }
  const entry = cache?.gifs?.byId?.[id];
  const formats = entry?.media_formats ?? entry?.results?.[0]?.media_formats;
  if (!formats) return [];
  for (const f of FORMAT_PRIORITY) {
    const url = pinTenor(formats[f.key]?.url);
    if (url) return [{ url, kind: f.kind, ext: f.ext, mediaKey: `tenor ${id}` }];
  }
  return [];
}

/**
 * Reads the current Tenor view page's original from the DOM (network-free), for
 * `collectMedia`. No-ops off a Tenor view page.
 */
export function tenorPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const id = tenorViewId(src);
  if (!id || typeof document === 'undefined') return [];
  return tenorMediaFromCache(document.getElementById('store-cache')?.textContent, id);
}
