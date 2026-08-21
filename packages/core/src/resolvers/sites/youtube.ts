import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

/**
 * YouTube resolver — POLICY-COMPLIANT, thumbnails only.
 *
 * YouTube video/audio streams are deliberately NOT touched: they are delivered
 * as ciphered DASH/HLS via googlevideo.com and downloading them violates the
 * YouTube ToS and Chrome Web Store policy (Google removes YT-ripper extensions).
 * What IS public and embeddable is the poster thumbnail on i.ytimg.com — served
 * openly with permissive CORS specifically so third parties can show it. This
 * resolver turns any YouTube video reference (watch link, youtu.be, /embed,
 * /shorts, /live, /v, youtube-nocookie) into that downloadable poster image.
 *
 * Collection is network-free, so we can't probe which variants exist. We emit
 * `hqdefault.jpg` (480×360) — the largest variant ALWAYS present for a valid id.
 * `maxresdefault`/`sddefault`/`hq720` are higher-res but 404 for many videos, so
 * synthesizing them would hand back dead links (same reasoning as #74).
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Reserved 11-char /embed/ slugs that pass ID_RE but aren't videos: `videoseries`
// (a playlist embed) and `live_stream` (legacy channel-live embed). Both would
// otherwise yield a bogus i.ytimg thumbnail for a non-video reference.
const RESERVED_IDS = new Set(['videoseries', 'live_stream']);

const PAGE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'gaming.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const PATH_ID_RE = /^\/(?:embed|shorts|live|v|e)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;

/**
 * Extracts the 11-char video id from any YouTube URL shape, or null when the URL
 * isn't a single-video YouTube reference (playlists without `v`, channels, feeds,
 * the i.ytimg thumbnail CDN, and non-YouTube hosts all return null).
 */
export function youtubeVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const valid = (id: string): boolean => ID_RE.test(id) && !RESERVED_IDS.has(id);

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return valid(id) ? id : null;
  }

  if (!PAGE_HOSTS.has(host)) return null;

  const v = u.searchParams.get('v');
  if (v && valid(v)) return v;

  const m = u.pathname.match(PATH_ID_RE);
  return m && valid(m[1]) ? m[1] : null;
}

const thumb = (id: string, name: string): string => `https://i.ytimg.com/vi/${id}/${name}.jpg`;

export const youtubeResolver: Resolver = {
  id: 'youtube',
  match: (u) => youtubeVideoId(u) !== null,
  resolve: (u): MediaCandidate[] => {
    const id = youtubeVideoId(u);
    if (!id) return [];
    return [
      {
        url: thumb(id, 'hqdefault'), // 480×360 — largest guaranteed variant
        kind: 'image',
        ext: 'jpg',
        thumbnailSrc: thumb(id, 'mqdefault'), // 320×180 — lighter grid preview
      },
    ];
  },
};
