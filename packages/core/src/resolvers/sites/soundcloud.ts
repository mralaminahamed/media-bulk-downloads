/**
 * SoundCloud track URL extraction. A track's playable audio lives behind the
 * `api-v2.soundcloud.com` `resolve` + transcoding endpoints (a `client_id` is
 * required), not the page, so the real stream is fetched on the opt-in resolve
 * pass (resolvers/network.ts → soundcloud). This module only recognises a track
 * *page* URL and hands its canonical form to that pass — the network resolver
 * validates it really is a track (a user/playlist page resolves to a non-track and
 * yields nothing).
 */

const RESERVED_USER = new Set([
  'you', 'discover', 'stream', 'search', 'upload', 'settings', 'messages',
  'notifications', 'tags', 'charts', 'feed', 'library', 'popular-tracks',
  'people', 'pages', 'terms-of-use', 'imprint', 'jobs', 'premium', 'creators',
  'mobile', 'signin', 'login', 'directory', 'embed', 'oembed', 'stations',
]);

const NON_TRACK_SLUG = new Set([
  'sets', 'tracks', 'albums', 'reposts', 'likes', 'comments', 'following',
  'followers', 'popular-tracks', 'stats', 'insights',
]);

function isSoundcloudHost(host: string): boolean {
  return host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'www.soundcloud.com';
}

/**
 * Returns the canonical `https://soundcloud.com/<user>/<slug>` track-page URL for a
 * SoundCloud track link, or null when the URL isn't a single track page (a user,
 * playlist/`sets`, collection, search, or non-SoundCloud host). The match is
 * intentionally loose on the slug (any two-segment user/track path) because the
 * resolve pass confirms it is really a track before returning media.
 */
export function soundcloudTrackUrl(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!isSoundcloudHost(u.hostname.toLowerCase())) return null;
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length !== 2) return null;
  const [user, slug] = segs;
  if (RESERVED_USER.has(user.toLowerCase()) || NON_TRACK_SLUG.has(slug.toLowerCase())) return null;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(user) || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) return null;
  return `https://soundcloud.com/${user}/${slug}`;
}
