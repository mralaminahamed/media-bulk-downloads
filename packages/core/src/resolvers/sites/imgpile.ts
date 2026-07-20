import { MediaCandidate } from '@mbd/core/resolvers/types';
import { imageExtFromUrl, extensionFromUrl } from '@mbd/core/collection/mediaType';

function isImgpileHost(host: string): boolean {
  return host === 'imgpile.com' || host.endsWith('.imgpile.com');
}

const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;

/** The post slug from an imgpile post URL (`/p/<slug>`), or null. */
export function imgpilePostSlug(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isImgpileHost(u.hostname.toLowerCase())) return null;
  return u.pathname.match(/^\/p\/([A-Za-z0-9_-]+)(?:[/?#]|$)/)?.[1] ?? null;
}

function classify(url: string): { kind: 'image' | 'video' | 'gif'; ext: string } | null {
  const img = imageExtFromUrl(url);
  if (img) return { kind: img === 'gif' ? 'gif' : 'image', ext: img };
  if (VIDEO_RE.test(url)) return { kind: 'video', ext: extensionFromUrl(url) ?? 'mp4' };
  return null;
}

/**
 * Extract an imgpile post's originals from its page markup (network-free). Each
 * `post-media` block's `<a href>` is a full-resolution file; they are read in order,
 * kept only when the href is a plaintext `https` media URL (image/gif/video), and
 * deduped. A post with no accessible media renders no such blocks → `[]` (fails
 * closed).
 */
export function imgpileMediaFromHtml(html: string, slug: string): MediaCandidate[] {
  if (typeof html !== 'string') return [];
  const blocks = html.split(/class\s*=\s*["'][^"']*\bpost-media\b/i).slice(1);
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const href = /<a\b[^>]*\bhref\s*=\s*["'](https:\/\/[^"']+)["']/i.exec(b)?.[1];
    if (!href || seen.has(href)) continue;
    const cls = classify(href);
    if (!cls) continue;
    seen.add(href);
    out.push({ url: href, kind: cls.kind, ext: cls.ext, mediaKey: `imgpile ${slug} ${out.length}` });
  }
  return out;
}

/**
 * Reads the current imgpile post page's originals from the DOM (network-free), for
 * `collectMedia`. No-ops off an imgpile post page.
 */
export function imgpilePageMedia(pageUrl?: string): MediaCandidate[] {
  const src = pageUrl ?? (typeof location !== 'undefined' ? location.href : '');
  const slug = imgpilePostSlug(src);
  if (!slug || typeof document === 'undefined') return [];
  return imgpileMediaFromHtml(document.documentElement.innerHTML, slug);
}
