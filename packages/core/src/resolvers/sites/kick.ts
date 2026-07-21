/**
 * Kick clip + VOD id extraction. A clip's progressive MP4 and a VOD's HLS master
 * both live behind Kick's own API (resolvers/network.ts → kick), not the page, so
 * the generic passes miss them. These feed the opt-in network resolve path.
 *
 * Clips resolve to a direct mp4 (`api/v2/clips/<id>/play` → `clip.clip_url`); VODs
 * (`/videos/<uuid>`) resolve to the `api/v1/video/<uuid>` HLS master (`source`).
 * Live channels have no id shape here and are left alone (no live-gating
 * circumvention); private/expired media fails closed downstream.
 */

const KICK_HOST_RE = /(?:^|\.)kick\.com$/i;
const CLIP_ID_RE = /^clip_[A-Za-z0-9]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kickUrl(raw: string | URL): URL | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  return KICK_HOST_RE.test(u.hostname.toLowerCase()) ? u : null;
}

/**
 * Extracts a Kick clip id from a `/clips/<id>` permalink, a channel
 * `/<channel>/clips/<id>` link, or an embed `?clip=<id>` query, or null when the
 * URL isn't a single Kick clip. Clip ids are `clip_<alnum>`.
 */
export function kickClipId(raw: string | URL): string | null {
  const u = kickUrl(raw);
  if (!u) return null;
  const fromPath = u.pathname.match(/\/clips\/(clip_[A-Za-z0-9]+)(?:[/?#]|$)/i)?.[1];
  const fromQuery = u.searchParams.get('clip');
  const id = fromPath ?? (fromQuery && CLIP_ID_RE.test(fromQuery) ? fromQuery : null);
  return id && CLIP_ID_RE.test(id) ? id : null;
}

/**
 * Extracts a Kick VOD id from a `/videos/<uuid>` permalink (or `/video/<uuid>`),
 * or null when the URL isn't a single Kick VOD. VOD ids are UUIDs.
 */
export function kickVideoId(raw: string | URL): string | null {
  const u = kickUrl(raw);
  if (!u) return null;
  const id = u.pathname.match(/\/videos?\/([0-9a-f-]{36})(?:[/?#]|$)/i)?.[1];
  return id && UUID_RE.test(id) ? id : null;
}
