import { MediaCandidate } from '@mbd/core/resolvers/types';

// Coub serves all media from its own CDN family (currently
// `attachments-cdn-s.coub.com`). The share/default render is a single combined
// audio+video mp4; every URL taken from the (untrusted) page JSON is pinned to
// the coub.com family before it becomes a downloadable candidate.
function pinCoub(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    const ok = u.protocol === 'https:' && (u.hostname === 'coub.com' || u.hostname.endsWith('.coub.com'));
    return ok ? u.href : null;
  } catch {
    return null;
  }
}

interface CoubObject {
  permalink?: unknown;
  file_versions?: { share?: { default?: unknown } };
  picture?: unknown;
}

/**
 * Coub (pure core: no DOM, no network). A Coub watch page (`coub.com/view/<permalink>`)
 * embeds the full coub object as JSON in `<script id="coubPageCoubJson" type="text/json">`;
 * content/collect.ts reads that element's text and passes it here. Returns the
 * `file_versions.share.default` render — a single combined (audio+video) mp4, so no
 * HLS capture or A/V mux is needed — as one ready-to-download video candidate, keyed
 * by permalink so a page and any later re-scan collapse to one row. The coub `picture`
 * is used as the poster. Every URL is host-pinned to the coub.com CDN family (the page
 * JSON is untrusted). Malformed JSON or a missing share render → `[]`.
 */
export function coubMediaFromJson(text: string | null | undefined): MediaCandidate[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  let coub: CoubObject;
  try {
    coub = JSON.parse(text) as CoubObject;
  } catch {
    return [];
  }
  const url = pinCoub(coub?.file_versions?.share?.default);
  if (!url) return [];

  const c: MediaCandidate = { url, kind: 'video', ext: 'mp4' };
  if (typeof coub.permalink === 'string' && /^[a-z0-9]+$/i.test(coub.permalink)) {
    c.mediaKey = `coub ${coub.permalink}`;
  }
  const poster = pinCoub(coub.picture);
  if (poster) c.poster = poster;
  return [c];
}
