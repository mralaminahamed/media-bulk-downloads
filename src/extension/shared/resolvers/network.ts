import { ResolveHint, ResolvedMedia } from '@/types';

export interface NetDeps { fetch: typeof fetch }

interface TwitterVideoVariant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}

interface TwitterMediaDetail {
  video_info?: { variants?: TwitterVideoVariant[] };
}

interface TwitterSyndicationResponse {
  mediaDetails?: TwitterMediaDetail[];
}

interface WallhavenResponse {
  data?: { path?: string };
}

interface VimeoProgressive {
  url?: string;
  height?: number;
}

interface VimeoConfig {
  request?: {
    files?: {
      progressive?: VimeoProgressive[];
      hls?: { default_cdn?: string; cdns?: Record<string, { url?: string }> };
    };
  };
}

interface DidService { id?: string; type?: string; serviceEndpoint?: string }
interface DidDoc { service?: DidService[] }

interface PinterestVideoEntry { url?: string }
interface PinterestPin { videos?: { video_list?: Record<string, PinterestVideoEntry> } }
interface PinterestWidgetResponse { data?: PinterestPin[] }

interface ArtStationAsset { asset_type?: string; player_embedded?: string }
interface ArtStationProject { assets?: ArtStationAsset[] }

/**
 * A URL taken from an API JSON response is untrusted: constrain it to https and
 * the expected host family before handing it back as a downloadable media URL.
 */
function pinnedUrl(url: string | null | undefined, hostSuffix: string): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const ok = u.protocol === 'https:' && (u.hostname === hostSuffix || u.hostname.endsWith(`.${hostSuffix}`));
    return ok ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Verbatim from react-tweet's getToken.
 * Source: https://raw.githubusercontent.com/vercel/react-tweet/main/packages/react-tweet/src/api/fetch-tweet.ts
 */
function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, '');
}

async function twitter(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    const token = getToken(id);
    const r = await deps.fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&lang=en`,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as TwitterSyndicationResponse;
    const details = j?.mediaDetails ?? [];
    let best: { bitrate: number; url: string } | null = null;
    for (const d of details) {
      for (const v of d?.video_info?.variants ?? []) {
        if (v?.content_type === 'video/mp4' && typeof v.url === 'string') {
          const bitrate = Number(v.bitrate) || 0;
          if (!best || bitrate > best.bitrate) best = { bitrate, url: v.url };
        }
      }
    }
    const mp4 = pinnedUrl(best?.url, 'twimg.com');
    if (mp4) return { url: mp4 };

    // No progressive mp4 — fall back to the x-mpegURL (HLS) master as a capturable
    // stream. Live masters are refused later by captureHls (no EXT-X-ENDLIST).
    let hlsUrl: string | null = null;
    for (const d of details) {
      for (const v of d?.video_info?.variants ?? []) {
        if (v?.content_type === 'application/x-mpegURL' && typeof v.url === 'string') {
          hlsUrl = v.url;
          break;
        }
      }
      if (hlsUrl) break;
    }
    const master = pinnedUrl(hlsUrl, 'twimg.com');
    return master ? { url: master, hls: true } : null;
  } catch {
    return null;
  }
}

async function wallhaven(id: string, deps: NetDeps): Promise<string | null> {
  try {
    const r = await deps.fetch(`https://wallhaven.cc/api/v1/w/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as WallhavenResponse;
    return pinnedUrl(j?.data?.path, 'wallhaven.cc');
  } catch {
    return null;
  }
}

function unsplash(id: string): string {
  return `https://unsplash.com/photos/${encodeURIComponent(id)}/download`;
}

/**
 * Vimeo: read the player config (public, refererless) and return the highest
 * progressive MP4 — a direct, downloadable file. Videos with no progressive
 * rendition (HLS/DASH-only) or that are domain-locked (config 403s) return null.
 */
async function vimeo(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    const r = await deps.fetch(`https://player.vimeo.com/video/${encodeURIComponent(id)}/config`);
    if (!r.ok) return null;
    const j = (await r.json()) as VimeoConfig;
    let best: { h: number; url: string } | null = null;
    for (const p of j?.request?.files?.progressive ?? []) {
      if (typeof p?.url === 'string') {
        const h = Number(p.height) || 0;
        if (!best || h > best.h) best = { h, url: p.url };
      }
    }
    const prog = pinnedUrl(best?.url, 'vimeocdn.com');
    if (prog) return { url: prog };

    // No progressive rendition — fall back to the HLS master (a .m3u8 to capture,
    // never a direct download). Vimeo HLS is demuxed fMP4; #170 mux gives it sound.
    const hls = j?.request?.files?.hls;
    const cdns = hls?.cdns ?? {};
    const chosen = (hls?.default_cdn ? cdns[hls.default_cdn]?.url : undefined) ?? Object.values(cdns)[0]?.url;
    const master = pinnedUrl(chosen, 'vimeocdn.com');
    return master ? { url: master, hls: true } : null;
  } catch {
    return null;
  }
}

/** The account's PDS origin (e.g. `https://x.host.bsky.network`) from its DID
 *  service doc, or null. `did:plc` is resolved via the fixed plc.directory
 *  mirror; `did:web` via the DID's own domain. Only an https PDS is accepted. */
function pdsFromDoc(doc: DidDoc): string | null {
  for (const s of doc?.service ?? []) {
    const isPds = s?.type === 'AtprotoPersonalDataServer' || (typeof s?.id === 'string' && s.id.endsWith('#atproto_pds'));
    if (isPds && typeof s?.serviceEndpoint === 'string') {
      try {
        const u = new URL(s.serviceEndpoint);
        if (u.protocol === 'https:') return u.origin;
      } catch { /* try the next service entry */ }
    }
  }
  return null;
}

async function resolvePdsHost(did: string, deps: NetDeps): Promise<string | null> {
  let docUrl: string | null = null;
  if (/^did:plc:[a-z0-9]+$/i.test(did)) {
    docUrl = `https://plc.directory/${encodeURIComponent(did)}`;
  } else if (did.startsWith('did:web:')) {
    const domain = did.slice('did:web:'.length);
    // Bare hostname only — no ports/paths (a colon or slash would let the DID
    // steer the fetch off a plain host). Out of scope by design.
    if (!/^[a-z0-9.-]+$/i.test(domain)) return null;
    docUrl = `https://${domain}/.well-known/did.json`;
  }
  if (!docUrl) return null;
  const r = await deps.fetch(docUrl);
  if (!r.ok) return null;
  return pdsFromDoc((await r.json()) as DidDoc);
}

/**
 * Bluesky. The hint id is a space-delimited `'<kind> <did> <cid>'` triple built
 * by bskyResolver (did/cid never contain spaces). `blob` resolves the account's
 * PDS from its DID and returns the true uploaded original via getBlob; `video`
 * deterministically builds the HLS master on video.bsky.app (no fetch).
 */
async function bsky(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    const parts = id.split(' ');
    if (parts.length !== 3) return null;
    const [kind, did, cid] = parts;
    if (kind === 'video') {
      // The AppView serves video at video.bsky.app/watch/<did>/<cid>/playlist.m3u8
      // with the DID percent-encoded — exactly what encodeURIComponent produces.
      const url = `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/playlist.m3u8`;
      return pinnedUrl(url, 'bsky.app') ? { url, hls: true } : null;
    }
    if (kind !== 'blob') return null;
    const pds = await resolvePdsHost(did, deps);
    if (!pds) return null;
    const url = `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
    return pinnedUrl(url, new URL(pds).hostname) ? { url } : null;
  } catch {
    return null;
  }
}

/**
 * Flickr (keyless). Sizes larger than `_b` are served under a different secret than
 * the thumbnail, so they can't be built offline. Recover the largest via two public,
 * unauthenticated hops: `photo.gne?id=<id>` → the canonical photo page, then its
 * `/sizes/` page → `/sizes/<largest>/`, whose HTML carries the correct-secret URL.
 * The canonical is host-pinned to flickr.com (open-redirect guard) and the result to
 * staticflickr.com. Any failed hop / shifted markup → null (the `_b` image stands).
 */
async function flickr(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^\d+$/.test(id)) return null;
    const g = await deps.fetch(`https://www.flickr.com/photo.gne?id=${encodeURIComponent(id)}`);
    if (!g.ok) return null;
    let canonical: URL;
    try { canonical = new URL(g.url); } catch { return null; }
    const flickrHost = canonical.protocol === 'https:' && (canonical.hostname === 'flickr.com' || canonical.hostname === 'www.flickr.com');
    if (!flickrHost || !new RegExp(`^/photos/[^/]+/${id}(?:/|$)`).test(canonical.pathname)) return null;

    const r = await deps.fetch(`${canonical.origin}${canonical.pathname.replace(/\/$/, '')}/sizes/`);
    if (!r.ok) return null;
    const code = new URL(r.url).pathname.match(/\/sizes\/([a-z0-9]+)\//i)?.[1];
    if (!code) return null;
    const body = await r.text();
    const m = body.match(new RegExp(`(?:https:)?//[^"' ]*?staticflickr\\.com/\\d+/${id}_[0-9a-z]+_${code}\\.(?:jpe?g|png|gif)`, 'i'));
    if (!m) return null;
    const url = m[0].startsWith('http') ? m[0] : `https:${m[0]}`;
    return pinnedUrl(url, 'staticflickr.com') ? { url } : null;
  } catch {
    return null;
  }
}

/**
 * Reddit. Deterministic, no fetch (like bsky video): the v.redd.it id already names
 * the account's video, and the HLS master is served signature-free under it. Returns
 * the master to capture — the extension's HLS engine muxes the separate audio
 * rendition it lists, so the download has sound (unlike the video-only CMAF_720.mp4
 * fallback). Guarded to the v.redd.it host.
 */
function reddit(id: string): ResolvedMedia | null {
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  const url = `https://v.redd.it/${id}/HLSPlaylist.m3u8`;
  return pinnedUrl(url, 'v.redd.it') ? { url, hls: true } : null;
}

/**
 * Pinterest. Reads the public, unauthenticated pin-widget endpoint (CORS-open, no
 * cookies/CSRF — usable from the background worker, unlike the CSRF-gated
 * PinResource API) and returns the pin's video: the progressive MP4 (`V_720P`) as a
 * direct download when present, else an HLS master (`V_HLSV4` / `V_HLSV3_MOBILE`) to
 * capture. Still pins (no `video_list`), private/deleted pins, and errors → null.
 */
async function pinterest(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    // The hint id is the numeric pin id from the resolver; reject anything else
    // before it reaches the query string.
    if (!/^\d+$/.test(id)) return null;
    const r = await deps.fetch(`https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as PinterestWidgetResponse;
    const list = j?.data?.[0]?.videos?.video_list;
    if (!list) return null;
    const mp4 = pinnedUrl(list.V_720P?.url, 'pinimg.com');
    if (mp4) return { url: mp4 };
    const hls = pinnedUrl(list.V_HLSV4?.url ?? list.V_HLSV3_MOBILE?.url, 'pinimg.com');
    return hls ? { url: hls, hls: true } : null;
  } catch {
    return null;
  }
}

/** Largest `<source>` mp4 in an ArtStation clip embed: the one with the biggest
 *  `min-width` media query (highest resolution), else the first mp4 source. */
function largestEmbedMp4(html: string): string | null {
  let best: { w: number; url: string } | null = null;
  const re = /<source\b[^>]*>/gi;
  for (const tag of html.match(re) ?? []) {
    const src = tag.match(/\bsrc=["']([^"']+\.mp4[^"']*)["']/i)?.[1];
    if (!src) continue;
    const w = Number(tag.match(/min-width:\s*(\d+)/i)?.[1]) || 0;
    if (!best || w > best.w) best = { w, url: src };
  }
  return best?.url ?? null;
}

/**
 * ArtStation (keyless). The hint id is `'<kind> <arg>'`:
 *  - `img <largeUrl>` → probe the `/4k/` sibling (bigger than `/large/`; `/original/`
 *    is 403-disabled) and return it only on an ok image response, else null so the
 *    sync `/large/` stands;
 *  - `vid <hash>` → read the public project JSON, take the first `video_clip`, fetch
 *    its signed embed page, and return the largest unsigned `<source>` mp4.
 * Results are host-pinned to artstation.com.
 */
async function artstation(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    const sep = id.indexOf(' ');
    const kind = id.slice(0, sep);
    const arg = id.slice(sep + 1);

    if (kind === 'img') {
      if (!arg.includes('/large/')) return null;
      const fourK = pinnedUrl(arg.replace('/large/', '/4k/'), 'artstation.com');
      if (!fourK) return null;
      const r = await deps.fetch(fourK);
      if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) return null;
      return { url: fourK };
    }

    if (kind === 'vid') {
      if (!/^[A-Za-z0-9]+$/.test(arg)) return null;
      const pr = await deps.fetch(`https://www.artstation.com/projects/${arg}.json`);
      if (!pr.ok) return null;
      const proj = (await pr.json()) as ArtStationProject;
      const clip = (proj.assets ?? []).find((a) => a?.asset_type === 'video_clip' && typeof a.player_embedded === 'string');
      const embed = pinnedUrl(clip?.player_embedded?.match(/\bsrc=["']([^"']+embed\.html[^"']*)["']/i)?.[1], 'artstation.com');
      if (!embed) return null;
      const er = await deps.fetch(embed);
      if (!er.ok) return null;
      const mp4 = pinnedUrl(largestEmbedMp4(await er.text()), 'artstation.com');
      return mp4 ? { url: mp4 } : null;
    }

    return null;
  } catch {
    return null;
  }
}

/** Resolve one hint to a final media target, or null on failure. Never throws. */
export async function resolveOriginal(hint: ResolveHint, deps: NetDeps): Promise<ResolvedMedia | null> {
  switch (hint.platform) {
    case 'twitter': return twitter(hint.id, deps);
    case 'wallhaven': { const u = await wallhaven(hint.id, deps); return u ? { url: u } : null; }
    case 'unsplash': return { url: unsplash(hint.id) };
    case 'vimeo': return vimeo(hint.id, deps);
    case 'bsky': return bsky(hint.id, deps);
    case 'pinterest': return pinterest(hint.id, deps);
    case 'reddit': return reddit(hint.id);
    case 'flickr': return flickr(hint.id, deps);
    case 'artstation': return artstation(hint.id, deps);
    default: return null;
  }
}
