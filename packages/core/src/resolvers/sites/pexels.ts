import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

function pinPexels(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(?:^|\.)pexels\.com$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

interface PexelsMedium {
  id?: unknown;
  image?: { download_link?: unknown };
  video?: { download_link?: unknown };
}
interface PexelsNextData {
  props?: { pageProps?: { medium?: PexelsMedium } };
}

/** True for a Pexels single photo/video page (where a `medium` is embedded). */
export function isPexelsMediaPage(raw: string | URL): boolean {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return false;
  }
  return /(?:^|\.)pexels\.com$/i.test(u.hostname) && /\/(?:photo|video)\//i.test(u.pathname);
}

/**
 * Extract a Pexels media page's original from its `__NEXT_DATA__` JSON
 * (network-free). `props.pageProps.medium` carries the item; a video's
 * `video.download_link` (else a photo's `image.download_link`) is the free
 * full-resolution original, pinned to the Pexels CDN (the JSON is untrusted). A page
 * with no embedded medium → `[]` (fails closed).
 */
export function pexelsMediaFromNextData(text: string | null | undefined): MediaCandidate[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  let root: PexelsNextData;
  try {
    root = JSON.parse(text) as PexelsNextData;
  } catch {
    return [];
  }
  const m = root?.props?.pageProps?.medium;
  if (!m) return [];
  const id = typeof m.id === 'string' || typeof m.id === 'number' ? String(m.id) : '';
  const vid = pinPexels(m.video?.download_link);
  if (vid) return [{ url: vid, kind: 'video', ext: extensionFromUrl(vid) ?? 'mp4', mediaKey: `pexels ${id}` }];
  const img = pinPexels(m.image?.download_link);
  if (img) {
    const ext = imageExtFromUrl(img) ?? 'jpg';
    return [{ url: img, kind: ext === 'gif' ? 'gif' : 'image', ext, mediaKey: `pexels ${id}` }];
  }
  return [];
}

/**
 * Reads the current Pexels photo/video page's original from the DOM (network-free),
 * for `collectMedia`. No-ops off a Pexels media page.
 */
export function pexelsPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  if (!isPexelsMediaPage(src) || typeof document === 'undefined') return [];
  return pexelsMediaFromNextData(document.getElementById('__NEXT_DATA__')?.textContent);
}
