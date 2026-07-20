/**
 * Twitch clip + VOD extraction. A clip's progressive MP4 and a VOD's HLS master
 * both live behind a GQL access-token call (resolvers/network.ts → twitch), not
 * the page, so the generic passes miss them. These feed the opt-in network resolve
 * path.
 *
 * Clips resolve to a direct mp4; VODs (`/videos/<id>`) resolve to the usher HLS
 * master. Live channels have no id shape here and are left alone (no circumvention
 * of live gating); sub-only/private VODs mint a token that usher rejects → the
 * capture simply fails, no circumvention.
 */

const SLUG_RE = /^[A-Za-z0-9_-]{4,100}$/;
const CLIPS_PATH_RE = /^\/([A-Za-z0-9_-]{4,100})(?:[/?#]|$)/;
const CHANNEL_CLIP_RE = /^\/[^/]+\/clip\/([A-Za-z0-9_-]{4,100})(?:[/?#]|$)/;
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

const VOD_PATH_RE = /^\/videos\/(\d+)(?:[/?#]|$)/;

/**
 * Extracts a Twitch VOD id from a `/videos/<id>` permalink (twitch.tv or a
 * subdomain like m.twitch.tv) or a `player.twitch.tv?video=<[v]id>` embed, or null
 * when the URL isn't a single VOD (a clip, channel, directory, or non-Twitch host).
 * VOD ids are numeric — the returned id is digits only.
 */
export function twitchVodId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host === 'player.twitch.tv') {
    const v = u.searchParams.get('video');
    return v ? (v.match(/^v?(\d+)$/)?.[1] ?? null) : null;
  }
  if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
    return u.pathname.match(VOD_PATH_RE)?.[1] ?? null;
  }
  return null;
}
