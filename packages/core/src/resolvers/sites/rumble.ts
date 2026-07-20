/**
 * Rumble watch/embed URL recognition. The embedJS metadata API needs Rumble's
 * *embed* id, which differs from the watch page's `v<id>` and does not appear in
 * the watch URL. So — like the gallery-page hint — the network resolver carries
 * the URL itself (rumble.com-pinned) and derives the embed id server-side via
 * Rumble's open oEmbed endpoint (the watch HTML is Cloudflare-gated; the JSON
 * APIs are not). resolvers/network.ts → rumble then reads the embedJS
 * `ua.hls.auto.url` HLS master. Rumble is HLS-only in current samples — the `ua`
 * object exposes no progressive mp4 (only tar/audio/timeline/hls; the timeline
 * entry is a low-bitrate scrub preview, never the video).
 */

function isRumbleHost(host: string): boolean {
  return host === 'rumble.com' || host === 'www.rumble.com';
}

/**
 * Returns the canonical `https://rumble.com/…` watch or embed URL when `raw` is a
 * single Rumble video (watch page `/v<id>-<slug>.html` or player `/embed/<id>/`),
 * or null otherwise. The full URL — not a bare id — is the resolve hint because
 * the embed id can only be obtained from Rumble's API, not the URL.
 */
export function rumbleWatchUrl(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (!isRumbleHost(u.hostname.toLowerCase())) return null;
  if (/^\/v[a-z0-9]+(?:-[^/]*)?\.html$/i.test(u.pathname)) return `https://rumble.com${u.pathname}`;
  if (/^\/embed\/[a-z0-9]+\/?$/i.test(u.pathname)) {
    return `https://rumble.com${u.pathname.replace(/\/?$/, '/')}`;
  }
  return null;
}
