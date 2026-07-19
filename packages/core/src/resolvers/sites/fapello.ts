import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

// A Fapello post page: `fapello.com/<model>/<id>/` (also `.su`). One media item is
// rendered inside a `uk-align-center` block; the visible `src` may carry a `.md`/`.th`
// size suffix, and the un-suffixed URL is the original.
function isFapelloHost(host: string): boolean {
  return (
    host === 'fapello.com' || host === 'fapello.su' ||
    host.endsWith('.fapello.com') || host.endsWith('.fapello.su')
  );
}

// First path segments that are category/listing routes, not a `<model>` slug — a
// `/<one>/<n>/` on these is pagination, not a post.
const NON_MODEL = new Set(['trending', 'videos', 'top-likes', 'top-followers', 'popular_videos', 'search', 'ai']);

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

export interface FapelloPostRef {
  model: string;
  id: string;
}

/** Parse a Fapello post URL (`/<model>/<id>/`), or null (not a post page). */
export function fapelloPostRef(raw: string | URL): FapelloPostRef | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isFapelloHost(u.hostname.toLowerCase())) return null;
  const m = u.pathname.match(/^\/([A-Za-z0-9._-]+)\/(\d+)\/?$/);
  if (!m || NON_MODEL.has(m[1].toLowerCase())) return null;
  return { model: m[1], id: m[2] };
}

// Drop a Fapello `.md`/`.th` size suffix (`name.md.jpg` → `name.jpg`), leaving the
// original. A no-op when the URL carries no such suffix.
function stripFapelloSize(url: string): string {
  return url.replace(/\.(?:md|th)(\.[a-z0-9]{1,5})(?=$|[?#])/i, '$1');
}

/**
 * Extract a Fapello post's single media item from its page markup (network-free).
 * The item sits in a `uk-align-center` block: an image (`<img src>`, `.md`/`.th`
 * suffix stripped to the original) or a video (`type="video"` / `<video>`, with a
 * `poster`). Only the block's own media is read; a page with no such block (a
 * listing, or a post with no accessible media) yields `[]` (fails closed).
 */
export function fapelloMediaFromHtml(html: string, ref: FapelloPostRef): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const at = html.search(/class="[^"]*\buk-align-center\b/i);
  if (at < 0) return [];
  const block = html.slice(at, at + 4000);
  const isVideo = /type="video"/i.test(block) || /<video\b/i.test(block);
  const rawSrc =
    /<source\b[^>]*\bsrc="([^"]+)"/i.exec(block)?.[1] ?? /\bsrc="([^"]+)"/i.exec(block)?.[1];
  if (!rawSrc) return [];
  const url = stripFapelloSize(rawSrc);
  const mediaKey = `fapello ${ref.model} ${ref.id}`;
  if (isVideo || VIDEO_RE.test(url)) {
    const poster = /\bposter="([^"]+)"/i.exec(block)?.[1];
    return [{ url, kind: 'video', ext: extensionFromUrl(url) ?? 'mp4', poster, mediaKey }];
  }
  const ext = imageExtFromUrl(url);
  if (!ext) return [];
  return [{ url, kind: ext === 'gif' ? 'gif' : 'image', ext, mediaKey }];
}

/**
 * Reads the current Fapello post page's media from the DOM (network-free), for
 * `collectMedia`. No-ops off a Fapello post page.
 */
export function fapelloPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const ref = fapelloPostRef(src);
  if (!ref || typeof document === 'undefined') return [];
  return fapelloMediaFromHtml(document.documentElement.innerHTML, ref);
}
