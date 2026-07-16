import { ResolveContext } from '@mbd/core/resolvers/types';

// Shared helpers for page-host-gated DOM resolvers — resolvers where the collected
// URL is on a media CDN but the true original is read from the *page* markup, so
// matching gates on `ctx.pageUrl` and the DOM-supplied URL is host-pinned before
// it becomes a downloadable candidate. (booru.ts / zerochan.ts predate this module
// and keep their own inline copies; new page-gated resolvers import these.)

/** Lowercased hostname of the page the media was collected from, or null. */
export function pageHost(ctx: ResolveContext): string | null {
  try {
    return new URL(ctx.pageUrl ?? '').hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Pin a page/DOM-supplied URL to https on one of the allowed host suffixes.
 * Relative URLs resolve against `base` (pass `ctx.pageUrl` for same-origin
 * hrefs; defaults to the document base for already-absolute inputs). Returns
 * the absolute href, or null if it isn't https or isn't on an allowed host.
 */
export function pinnedDomUrl(
  url: string | null | undefined,
  suffixes: string[],
  base?: string,
): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const fallbackBase = typeof document !== 'undefined' ? document.baseURI : undefined;
    const u = new URL(url, base ?? fallbackBase);
    if (u.protocol !== 'https:') return null;
    return suffixes.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`)) ? u.href : null;
  } catch {
    return null;
  }
}

/** Media kind from a file extension, matching the booru resolver's mapping. */
export function kindFromExt(ext: string | null | undefined): 'image' | 'video' | 'gif' {
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (ext === 'gif') return 'gif';
  return 'image';
}
