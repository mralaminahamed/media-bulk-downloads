import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

// Imgur serves originals from i.imgur.com. A post page (`imgur.com/<id>`,
// `/a/<id>`, `/gallery/<id>`) assigns the whole post to `window.postDataJSON`
// (a JSON string); its `media[]` carry the direct i.imgur.com URLs. Pin every
// URL to that CDN — the page JSON is untrusted.
function pinImgur(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'i.imgur.com' ? u.href : null;
  } catch {
    return null;
  }
}

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

interface ImgurMediaEntry {
  id?: unknown;
  url?: unknown;
}
interface ImgurPost {
  id?: unknown;
  media?: ImgurMediaEntry[];
}

/**
 * Extract an Imgur post's media from its page markup (network-free). The page
 * assigns the post as a JSON string to `window.postDataJSON`; its `media[]` hold
 * the direct i.imgur.com originals (an album/gallery ships every item, a single
 * post one). Each URL is pinned to i.imgur.com (the JSON is untrusted) and
 * classified by extension (an animated post's `.mp4`/`.gif` twin is honoured as
 * shipped). A removed/empty post carries no media → `[]` (fails closed).
 */
export function imgurMediaFromHtml(html: string): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  let post: ImgurPost;
  try {
    // Primary form: window.postDataJSON = "<escaped-json-string>" — capture the JS
    // string literal, then JSON.parse twice (unescape → object).
    const lit = /window\.postDataJSON\s*=\s*("(?:[^"\\]|\\.)*")/.exec(html)?.[1];
    if (lit) {
      const once = JSON.parse(lit);
      post = (typeof once === 'string' ? JSON.parse(once) : once) as ImgurPost;
    } else {
      // Fallback: the object inlined directly (…= {…}</script>).
      const obj = /window\.postDataJSON\s*=\s*(\{[\s\S]*?\})\s*<\/script>/.exec(html)?.[1];
      if (!obj) return [];
      post = JSON.parse(obj) as ImgurPost;
    }
  } catch {
    return [];
  }
  const media = post?.media;
  if (!Array.isArray(media)) return [];
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  media.forEach((mm, i) => {
    const url = pinImgur(mm?.url);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const mediaKey = `imgur ${typeof mm?.id === 'string' && mm.id ? mm.id : i}`;
    const img = imageExtFromUrl(url);
    if (img) {
      out.push({ url, kind: img === 'gif' ? 'gif' : 'image', ext: img, mediaKey });
      return;
    }
    if (VIDEO_RE.test(url)) {
      out.push({ url, kind: 'video', ext: extensionFromUrl(url) ?? 'mp4', mediaKey });
    }
  });
  return out;
}

/**
 * Reads the current Imgur post page's media from the DOM (network-free), for
 * `collectMedia`. No-ops off an Imgur post page.
 */
export function imgurPageMedia(): MediaCandidate[] {
  if (typeof document === 'undefined') return [];
  return imgurMediaFromHtml(document.documentElement.innerHTML);
}
