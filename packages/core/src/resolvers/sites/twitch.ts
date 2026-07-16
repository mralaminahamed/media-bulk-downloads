/**
 * Twitch clip slug extraction. A clip's progressive MP4 lives behind a GQL
 * persisted query (resolvers/network.ts → twitch), not the page, so the generic
 * passes miss it. This slug feeds the opt-in network resolve path.
 *
 * Only clips resolve — VODs (`/videos/<id>`) and live channels have no slug shape
 * here and are left alone (no circumvention of subscriber/live gating).
 */

// Twitch clip slugs are either word-concatenated (AwkwardHelplessSalamander…) or
// the newer hyphen/underscore form (GoodPluckyEggnog-ab12CD_x): alnum plus - and _.
const SLUG_RE = /^[A-Za-z0-9_-]{4,100}$/;
// clips.twitch.tv/<slug>  — a single path segment.
const CLIPS_PATH_RE = /^\/([A-Za-z0-9_-]{4,100})(?:[/?#]|$)/;
// twitch.tv/<channel>/clip/<slug>  — channel is one non-clip segment.
const CHANNEL_CLIP_RE = /^\/[^/]+\/clip\/([A-Za-z0-9_-]{4,100})(?:[/?#]|$)/;
// First-segment words on clips.twitch.tv that are never a clip slug.
const RESERVED = new Set(['embed', 'download', 'directory', 'clips']);

function validSlug(s: string | null | undefined): string | null {
  if (!s || RESERVED.has(s.toLowerCase()) || !SLUG_RE.test(s)) return null;
  return s;
}

/**
 * Extracts a Twitch clip slug from a clips permalink, a channel `/clip/` link, or
 * an embed player's `?clip=` query, or null when the URL isn't a single Twitch
 * clip (a channel/VOD/directory page, or a non-Twitch host).
 */
export function twitchClipId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  // Embed players (clips.twitch.tv/embed, player.twitch.tv) carry the slug in ?clip=.
  const clipParam = u.searchParams.get('clip');
  if (host === 'clips.twitch.tv') {
    if (u.pathname === '/embed' || u.pathname === '/embed/') return validSlug(clipParam);
    return validSlug(u.pathname.match(CLIPS_PATH_RE)?.[1]);
  }
  if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
    return validSlug(u.pathname.match(CHANNEL_CLIP_RE)?.[1] ?? clipParam);
  }
  return null;
}
