/**
 * Rutube video-id extraction. Rutube serves video as an HLS master behind its
 * public play-options API (rutube.ru/api/play/options/<id>/), not a raw .m3u8 in
 * the page, so the generic HLS sniffer misses it. The 32-hex id feeds the opt-in
 * network path (resolvers/network.ts → rutube), which reads the
 * `video_balancer.m3u8` master and hands the unsigned bl.rutube.ru URL to the
 * HLS engine (the balancer mints the signed per-variant playlists itself).
 *
 * Adult/premium/geo-gated streams are not circumvented — a gated video simply
 * yields no usable master downstream.
 */

function isRutubeHost(host: string): boolean {
  return host === 'rutube.ru' || host.endsWith('.rutube.ru');
}

/**
 * Extracts a Rutube video id (32 lowercase hex) from a watch, player-embed, or
 * shorts URL, or null when the URL isn't a single Rutube video.
 */
export function rutubeVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isRutubeHost(u.hostname.toLowerCase())) return null;
  const m = u.pathname.match(/^\/(?:video|play\/embed|shorts)\/([0-9a-f]{32})(?:[/?#]|$)/i);
  return m ? m[1].toLowerCase() : null;
}
