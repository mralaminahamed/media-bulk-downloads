import { MediaCandidate } from '@mbd/core/resolvers/types';

const PH_HOST_RE = /(?:^|\.)pornhub\.com$/i;

function pinPhncdn(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(?:^|\.)phncdn\.com$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * The video id for a Pornhub watch (`/view_video.php?viewkey=<vk>`) or embed
 * (`/embed/<id>`) page, or null off such a page (listings/models/gifs).
 */
export function pornhubVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, typeof document !== 'undefined' ? document.baseURI : undefined);
  } catch {
    return null;
  }
  if (!PH_HOST_RE.test(u.hostname.toLowerCase())) return null;
  const vk = u.searchParams.get('viewkey');
  if (vk && /^[a-z0-9]+$/i.test(vk)) return vk;
  const m = u.pathname.match(/^\/embed\/([a-z0-9]+)(?:[/?#]|$)/i);
  return m ? m[1] : null;
}

function balancedJsonAfter(html: string, marker: RegExp): string | null {
  const m = marker.exec(html);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < html.length && html[i] !== '{') i++;
  const start = i;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

interface PhMediaDef {
  format?: unknown;
  videoUrl?: unknown;
  quality?: unknown;
  remote?: unknown;
}
interface PhFlashvars {
  mediaDefinitions?: PhMediaDef[];
  image_url?: unknown;
}

/**
 * Extract a Pornhub watch page's stream from its inline `flashvars_<id>` JSON
 * (network-free). The `format:"hls"` master (`videoUrl` → `master.m3u8`, pinned to
 * `*.phncdn.com`) is surfaced as an HLS video; the `remote`/`get_media` mp4 entry is
 * skipped (needs a signed fetch). No flashvars / no pinned HLS master → `[]` (fails
 * closed against obfuscated or paid pages).
 */
export function pornhubMediaFromHtml(html: string, id?: string | null): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const blob = balancedJsonAfter(html, /flashvars_[0-9]+\s*=\s*/);
  if (!blob) return [];
  let fv: PhFlashvars;
  try {
    fv = JSON.parse(blob) as PhFlashvars;
  } catch {
    return [];
  }
  const defs = Array.isArray(fv.mediaDefinitions) ? fv.mediaDefinitions : [];

  let master: string | null = null;
  let fallback: string | null = null;
  for (const d of defs) {
    if (!d || String(d.format).toLowerCase() !== 'hls' || d.remote) continue;
    const pinned = pinPhncdn(d.videoUrl);
    if (!pinned || !/\.m3u8(?:[?#]|$)/i.test(pinned)) continue;
    if (Array.isArray(d.quality)) {
      master = pinned;
      break;
    }
    fallback ??= pinned;
  }
  const url = master ?? fallback;
  if (!url) return [];

  const c: MediaCandidate = { url, kind: 'video', ext: 'm3u8' };
  const poster = pinPhncdn(fv.image_url);
  if (poster) c.poster = poster;
  if (id) c.mediaKey = `pornhub ${id}`;
  return [c];
}

/**
 * Reads the current Pornhub watch/embed page's stream from the DOM (network-free),
 * for `collectMedia`. No-ops off a Pornhub video page.
 */
export function pornhubPageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const id = pornhubVideoId(src);
  if (id === null || typeof document === 'undefined') return [];
  return pornhubMediaFromHtml(document.documentElement.innerHTML, id);
}
