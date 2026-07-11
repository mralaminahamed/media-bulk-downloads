/**
 * Dailymotion video-id extraction. Dailymotion delivers video through its own
 * player metadata (dailymotion.com/player/metadata/video/<id>) as an HLS master,
 * not a raw .m3u8 in the page, so the generic HLS sniffer misses it. This id
 * feeds the opt-in network path (resolvers/network.ts → dailymotion), which
 * reads the metadata's `qualities.auto` master.
 *
 * DRM/geo-locked videos (`protected_delivery`) resolve to null downstream (no
 * circumvention).
 */

// Dailymotion ids are alphanumeric, `x`-prefixed (e.g. x8pp4d0); kept permissive
// but host-gated. The [A-Za-z0-9]+ capture naturally stops at a `_slug`.
const ID_RE = /^([A-Za-z0-9]{5,})/;

function isDailymotionHost(host: string): boolean {
  return host === 'dai.ly' || host === 'www.dai.ly'
    || host === 'dailymotion.com' || host.endsWith('.dailymotion.com');
}

/**
 * Extracts a Dailymotion video id from a watch, embed, short (dai.ly), or geo
 * player URL, or null when the URL isn't a single Dailymotion video.
 */
export function dailymotionVideoId(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!isDailymotionHost(host)) return null;

  // dai.ly/<id>  (short link; id is the first path segment)
  if (host === 'dai.ly' || host === 'www.dai.ly') {
    const m = u.pathname.slice(1).match(ID_RE);
    return m ? m[1] : null;
  }

  // geo.dailymotion.com/player[...].html?video=<id>
  const q = u.searchParams.get('video');
  if (q) {
    const m = q.match(ID_RE);
    if (m) return m[1];
  }

  // /video/<id> and /embed/video/<id> (tolerate a trailing _slug)
  const path = u.pathname.match(/^\/(?:embed\/)?video\/([A-Za-z0-9]{5,})/);
  return path ? path[1] : null;
}
