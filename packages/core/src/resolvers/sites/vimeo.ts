/**
 * Vimeo video-id extraction. Vimeo delivers video through its own player config
 * (player.vimeo.com/video/<id>/config), not a raw .m3u8, so the generic HLS
 * sniffer misses it. This id feeds the opt-in network resolve path
 * (resolvers/network.ts → vimeo), which reads the config's progressive MP4s.
 *
 * Only public, non-domain-locked videos resolve; privacy-locked embeds return a
 * 403 from the config endpoint and are left unresolved (no circumvention).
 */

const ID = '(\\d{6,})';
const PLAYER_RE = new RegExp(`^/video/${ID}`);
const PAGE_RE = new RegExp(`/${ID}(?:[/?#]|$)`);

/**
 * Extracts a Vimeo video id from a watch URL or an embed URL, or null when the
 * URL isn't a single Vimeo video (a channel/user page, or a non-Vimeo host).
 */
export function vimeoVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com' && !host.endsWith('.vimeo.com')) return null;
  const player = u.pathname.match(PLAYER_RE);
  if (player) return player[1];
  const page = u.pathname.match(PAGE_RE);
  return page ? page[1] : null;
}
