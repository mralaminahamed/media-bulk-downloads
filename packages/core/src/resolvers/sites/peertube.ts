/**
 * PeerTube watch/embed URL recognition — host-agnostic across the whole
 * federation (like the Mastodon media rule). PeerTube has no fixed media host,
 * so the resolve hint carries the canonical *embed* URL
 * `https://<instance>/videos/embed/<id>` and resolvers/network.ts → peertube
 * parses the instance origin + video id from it. That resolver SSRF-guards the
 * (page-controlled) instance host, probes `/api/v1/config` to confirm the host
 * really is PeerTube before any video fetch, then reads the HLS master
 * (`streamingPlaylists[0].playlistUrl`) or the widest direct mp4
 * (`files[].fileDownloadUrl`) — each returned URL re-guarded, since PeerTube can
 * serve media from remote object storage off the instance host.
 */

// A PeerTube video id is either a full RFC-4122 UUID or its base58 (flickrBase58)
// shortUUID (~21–22 chars, the alphabet excludes 0/O/I/l); `/api/v1/videos/<id>`
// accepts either. Matching an exact id shape (not a bare slug) keeps the modern
// `/w/<id>` path from firing on unrelated sites that happen to use `/w/`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_RE = /^[1-9A-HJ-NP-Za-km-z]{21,22}$/;

function isVideoId(id: string): boolean {
  return UUID_RE.test(id) || SHORT_RE.test(id);
}

/**
 * Returns the canonical `https://<instance>/videos/embed/<id>` URL when `raw` is
 * a single PeerTube video — the player embed `/videos/embed/<id>`, the modern
 * watch page `/w/<id>`, or the legacy watch page `/videos/watch/<id>` — on any
 * instance host, or null otherwise. The `/w/p/<id>` playlist path does not match
 * (extra segment). The instance host is preserved (federation is host-agnostic);
 * only the returned string's *shape* is normalised to the embed form the network
 * resolver parses.
 */
export function peertubeEmbedUrl(raw: string | URL): string | null {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const m =
    /^\/videos\/embed\/([^/?#]+)$/.exec(u.pathname) ??
    /^\/w\/([^/?#]+)$/.exec(u.pathname) ??
    /^\/videos\/watch\/([^/?#]+)$/.exec(u.pathname);
  if (!m || !isVideoId(m[1])) return null;
  return `${u.origin}/videos/embed/${m[1]}`;
}
