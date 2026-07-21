import { ResolveHint, ResolvedMedia } from '@mbd/core/types';
import { isSafeCaptureUrl } from '@mbd/core/download/stream/ssrf-guard';
import { stripUrlSecrets } from '@mbd/core/net/url-secrets';
import { TWITCH_CLIENT_ID, TWITCH_GQL_OP, TWITCH_GQL_SHA256, TWITCH_VOD_GQL_QUERY } from '@mbd/core/resolvers/twitch-constants';

export interface NetDeps { fetch: typeof fetch }

interface TwitterVideoVariant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}

interface TwitterMediaDetail {
  type?: string;
  media_url_https?: string;
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

interface DailymotionQuality { type?: string; url?: string }
interface DailymotionMetadata {
  error?: unknown;
  protected_delivery?: boolean;
  qualities?: { auto?: DailymotionQuality[] };
}

interface DidService { id?: string; type?: string; serviceEndpoint?: string }
interface DidDoc { service?: DidService[] }

interface PinterestVideoEntry { url?: string }
interface PinterestPin { videos?: { video_list?: Record<string, PinterestVideoEntry> } }
interface PinterestWidgetResponse { data?: PinterestPin[] }

interface ArtStationAsset { asset_type?: string; player_embedded?: string }
interface ArtStationProject { assets?: ArtStationAsset[] }

interface StreamableFile { url?: string }
interface StreamableResponse { files?: Record<string, StreamableFile> }

interface RutubePlayOptions { video_balancer?: { m3u8?: string; default?: string } }

interface RumbleEmbedJs { ua?: { hls?: { auto?: { url?: string } } } }

interface LoomTranscoded { url?: string }

interface PeerTubeConfig { serverVersion?: string }
interface PeerTubeResolution { id?: number }
interface PeerTubeFile { resolution?: PeerTubeResolution; fileUrl?: string; fileDownloadUrl?: string }
interface PeerTubeStreamingPlaylist { playlistUrl?: string; files?: PeerTubeFile[] }
interface PeerTubeVideoDetail { streamingPlaylists?: PeerTubeStreamingPlaylist[]; files?: PeerTubeFile[] }

interface RedgifsAuth { token?: string }
interface RedgifsUrls { hd?: string; sd?: string }
interface RedgifsGif { urls?: RedgifsUrls }
interface RedgifsGifResponse { gif?: RedgifsGif; urls?: RedgifsUrls }

interface TwitchClipQuality { quality?: string; sourceURL?: string }
interface TwitchPlaybackAccessToken { signature?: string; value?: string }
interface TwitchClip { videoQualities?: TwitchClipQuality[]; playbackAccessToken?: TwitchPlaybackAccessToken }
interface TwitchGqlResponse { data?: { clip?: TwitchClip | null } }
interface TwitchVodGqlResponse { data?: { videoPlaybackAccessToken?: TwitchPlaybackAccessToken | null } }

interface ScTranscodingFormat { protocol?: string; mime_type?: string }
interface ScTranscoding { url?: string; preset?: string; format?: ScTranscodingFormat }
interface ScTrack { kind?: string; media?: { transcodings?: ScTranscoding[] } }
interface ScStreamUrl { url?: string }

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
 * An API URL whose host cannot be pinned to a fixed family — PeerTube serves a
 * video's media from the instance itself, an object-storage subdomain, OR (for a
 * federated video) another instance's domain entirely, so there is no known
 * suffix to check. Constrain it to https + the SSRF host policy (no internal /
 * loopback / link-local target) instead, the same guard the capture engines use
 * on page-controlled manifest URLs.
 */
function safeFederatedUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return isSafeCaptureUrl(u.href) ? u.href : null;
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

/**
 * Twitter. The hint id is either a bare status id (video, unchanged) or
 * `'photo <sid> <n>'` — a 1-based index into the same syndication response's
 * `mediaDetails`, produced for an unpainted `/status/<sid>/photo/<n>` grid cell.
 * The photo branch returns the indexed entry's `media_url_https` forced to
 * `name=orig`, refusing anything that isn't a photo (video/missing entry) or
 * whose URL isn't twimg.com (untrusted JSON).
 */
async function twitter(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  const photo = id.match(/^photo (\d{1,20}) (\d{1,3})$/);
  const sid = photo ? photo[1] : id;
  try {
    const token = getToken(sid);
    const r = await deps.fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(sid)}&token=${encodeURIComponent(token)}&lang=en`,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as TwitterSyndicationResponse;
    const details = j?.mediaDetails ?? [];

    if (photo) {
      const entry = details[Number(photo[2]) - 1];
      if (!entry || entry.video_info || entry.type === 'video' || typeof entry.media_url_https !== 'string') return null;
      const pinned = pinnedUrl(entry.media_url_https, 'twimg.com');
      if (!pinned) return null;
      const u = new URL(pinned);
      u.searchParams.set('name', 'orig');
      return { url: u.href };
    }

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

    const hls = j?.request?.files?.hls;
    const cdns = hls?.cdns ?? {};
    const chosen = (hls?.default_cdn ? cdns[hls.default_cdn]?.url : undefined) ?? Object.values(cdns)[0]?.url;
    const master = pinnedUrl(chosen, 'vimeocdn.com');
    return master ? { url: master, hls: true } : null;
  } catch {
    return null;
  }
}

/**
 * Dailymotion: read the public player metadata (no Referer) and return the
 * `qualities.auto` HLS master to capture. Modern Dailymotion is HLS-only (no
 * progressive MP4). DRM/geo-locked videos carry `protected_delivery: true` (or an
 * `error`) and return null — no circumvention.
 */
async function dailymotion(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^[A-Za-z0-9]+$/.test(id)) return null;
    const r = await deps.fetch(`https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as DailymotionMetadata;
    if (j?.error || j?.protected_delivery === true) return null;
    const auto = j?.qualities?.auto ?? [];
    const master = auto.find((q) => q?.type === 'application/x-mpegURL' && typeof q.url === 'string')?.url;
    const pinned = pinnedUrl(master, 'dailymotion.com');
    return pinned ? { url: pinned, hls: true } : null;
  } catch {
    return null;
  }
}

/**
 * Rutube: read the public play-options API (no auth) and return the
 * `video_balancer.m3u8` HLS master, pinned to the rutube.ru family (the master
 * lives on bl.rutube.ru). The master is unsigned — a `guids` variant list only;
 * the balancer mints the per-variant signed playlists itself, so the resolver
 * only hands the master to the HLS engine. Adult/premium/geo-gated streams are
 * not circumvented (a gated video yields no usable master).
 */
async function rutube(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^[0-9a-f]{32}$/i.test(id)) return null;
    const r = await deps.fetch(`https://rutube.ru/api/play/options/${encodeURIComponent(id)}/?format=json`);
    if (!r.ok) return null;
    const j = (await r.json()) as RutubePlayOptions;
    const master = j?.video_balancer?.m3u8 ?? j?.video_balancer?.default;
    const pinned = pinnedUrl(master, 'rutube.ru');
    return pinned ? { url: pinned, hls: true } : null;
  } catch {
    return null;
  }
}

const RUMBLE_HOSTS = ['rumble.com', '1a-1791.com', 'rmbl.ws', 'rumble.cloud'];

/**
 * Rumble: the hint carries the watch/embed URL (rumble.com-pinned). Derive the
 * embed id — directly from an `/embed/<id>/` URL, else via Rumble's open oEmbed
 * endpoint (the watch HTML is Cloudflare-gated; the JSON APIs are not) — then
 * read the embedJS metadata's `ua.hls.auto.url` HLS master, pinned to the
 * Rumble-CDN allowlist. HLS-only: current samples expose no progressive mp4.
 */
async function rumble(watchUrl: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    const watch = pinnedUrl(watchUrl, 'rumble.com');
    if (!watch) return null;
    let embedId = /^\/embed\/([a-z0-9]+)\/?$/i.exec(new URL(watch).pathname)?.[1] ?? null;
    if (!embedId) {
      const o = await deps.fetch(`https://rumble.com/api/Media/oembed.json?url=${encodeURIComponent(watch)}`);
      if (!o.ok) return null;
      const oj = (await o.json()) as { html?: unknown };
      embedId = typeof oj?.html === 'string'
        ? /rumble\.com\/embed\/([a-z0-9]+)\//i.exec(oj.html)?.[1] ?? null
        : null;
    }
    if (!embedId || !/^[a-z0-9]+$/i.test(embedId)) return null;
    const r = await deps.fetch(`https://rumble.com/embedJS/u3/?request=video&ver=2&v=${encodeURIComponent(embedId)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as RumbleEmbedJs;
    const hls = j?.ua?.hls?.auto?.url;
    const pinned = RUMBLE_HOSTS.reduce<string | null>((acc, h) => acc ?? pinnedUrl(hls, h), null);
    return pinned ? { url: pinned, hls: true } : null;
  } catch {
    return null;
  }
}

/**
 * Loom (opt-in). A public Loom share's transcoded mp4 is minted by an
 * unauthenticated POST to `campaigns/sessions/<id>/transcoded-url`, returning a
 * CloudFront-signed `cdn.loom.com` mp4 — a direct, time-limited download (resolved
 * on demand, never cached). Some shares have no transcoded render yet (HTTP 204);
 * for those, `raw-url` returns the `luna.loom.com` HLS master to capture instead.
 * Workspace-restricted looms 401/403 on both and resolve to null (no circumvention).
 * Both hosts are under loom.com, so the returned URL is pinned to that family.
 */
async function loom(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^[0-9a-f]{32}$/i.test(id)) return null;
    const post = (kind: string): Promise<Response> =>
      deps.fetch(`https://www.loom.com/api/campaigns/sessions/${encodeURIComponent(id)}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

    const t = await post('transcoded-url');
    if (t.ok && t.status !== 204) {
      const mp4 = pinnedUrl(((await t.json()) as LoomTranscoded)?.url, 'loom.com');
      if (mp4) return { url: mp4 };
    }
    const r = await post('raw-url');
    if (!r.ok || r.status === 204) return null;
    const hls = pinnedUrl(((await r.json()) as LoomTranscoded)?.url, 'loom.com');
    return hls ? { url: hls, hls: true } : null;
  } catch {
    return null;
  }
}

/**
 * PeerTube (host-agnostic, opt-in). The hint carries the canonical embed URL
 * `https://<instance>/videos/embed/<id>`. The instance host is page-controlled,
 * so it is SSRF-guarded before any fetch, then `/api/v1/config` must confirm the
 * host is really PeerTube (top-level `serverVersion`) before the video metadata
 * is fetched — a `/w/<id>` or `/videos/watch/<id>` shape on an arbitrary host
 * must not drive a blind API call. `/api/v1/videos/<id>` then yields the widest
 * direct single file (`fileUrl`, from both the progressive web-video list and
 * the per-rendition HLS list — each entry is one complete mp4/fmp4), falling
 * back to the HLS master (`streamingPlaylists[0].playlistUrl`) to capture.
 * Because PeerTube can serve media from remote object storage (host ≠ instance)
 * and a federated video comes off another instance entirely, every returned URL
 * is re-guarded with the SSRF policy rather than pinned to a fixed suffix.
 * Private / password / internal videos expose no public file → null.
 */
async function peertube(embedUrl: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    const u = new URL(embedUrl);
    if (u.protocol !== 'https:') return null;
    const id = /^\/videos\/embed\/([0-9A-Za-z-]{8,40})$/.exec(u.pathname)?.[1];
    if (!id) return null;
    const origin = u.origin;
    if (!isSafeCaptureUrl(origin)) return null;

    const cfg = await deps.fetch(`${origin}/api/v1/config`);
    if (!cfg.ok) return null;
    const cj = (await cfg.json()) as PeerTubeConfig;
    if (typeof cj?.serverVersion !== 'string') return null;

    const r = await deps.fetch(`${origin}/api/v1/videos/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as PeerTubeVideoDetail;

    let best: { h: number; url: string } | null = null;
    for (const f of [...(j.files ?? []), ...(j.streamingPlaylists?.[0]?.files ?? [])]) {
      const url = safeFederatedUrl(f?.fileUrl) ?? safeFederatedUrl(f?.fileDownloadUrl);
      if (!url) continue;
      const h = Number(f?.resolution?.id) || 0;
      if (!best || h > best.h) best = { h, url };
    }
    if (best) return { url: best.url };

    const master = safeFederatedUrl(j.streamingPlaylists?.[0]?.playlistUrl);
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
    if (!/^[a-z0-9.-]+$/i.test(domain)) return null;
    docUrl = `https://${domain}/.well-known/did.json`;
  }
  if (!docUrl) return null;
  if (!isSafeCaptureUrl(docUrl)) return null;
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
      const url = `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/playlist.m3u8`;
      return pinnedUrl(url, 'bsky.app') ? { url, hls: true } : null;
    }
    if (kind !== 'blob') return null;
    const pds = await resolvePdsHost(did, deps);
    if (!pds) return null;
    const url = `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
    if (!isSafeCaptureUrl(url)) return null;
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

const IMG_EXT_RE = /\.(?:jpe?g|png|webp|avif|gif|bmp|tiff?)(?:$|[?#])/i;

/** Read a `<meta property|name="<prop>" content="...">` value, tolerating either
 *  attribute order (content-first is common). */
function metaContent(html: string, prop: string): string | null {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*\\bcontent=["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+\\bcontent=["']([^"']+)["'][^>]*(?:property|name)=["']${p}["']`, 'i'))?.[1] ??
    null
  );
}

/** The largest `<img>` by declared width attribute (image-extension src only) — a
 *  last-resort fallback when no social-card meta names the main image. */
function largestImg(html: string): string | null {
  let best: string | null = null;
  let bestW = -1;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = m[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src || !IMG_EXT_RE.test(src)) continue;
    const w = Number(m[0].match(/\bwidth=["']?(\d+)/i)?.[1] ?? 0);
    if (w > bestW) { bestW = w; best = src; }
  }
  return best;
}

const GALLERY_HTML_SCAN_CAP = 512 * 1024;

/** Extract the main image from a host/"view" page's HTML (regex only — no
 *  DOMParser in the service worker), preferring social-card metadata, then a
 *  `<link rel=image_src>`, then the largest declared `<img>`. */
function extractMainImage(rawHtml: string, baseUrl: string): string | null {
  const html = rawHtml.length > GALLERY_HTML_SCAN_CAP ? rawHtml.slice(0, GALLERY_HTML_SCAN_CAP) : rawHtml;
  const candidate =
    metaContent(html, 'og:image:secure_url') ??
    metaContent(html, 'og:image') ??
    metaContent(html, 'twitter:image') ??
    metaContent(html, 'twitter:image:src') ??
    html.match(/<link[^>]+rel=["']image_src["'][^>]*\bhref=["']([^"']+)["']/i)?.[1] ??
    largestImg(html);
  if (!candidate) return null;
  try { return new URL(candidate, baseUrl).href; } catch { return null; }
}

/**
 * Generic gallery-link follower (#287). The hint id is a same-origin host/"view"
 * page URL captured in collect.ts. Fetch it (opt-in resolve pass only), extract
 * its main image by regex, and return that as the original. Both the page fetch
 * AND the extracted image URL are page-controlled, so each is SSRF-guarded like
 * the did:web/bsky fetches; query tokens are stripped from the result.
 */
async function galleryPage(pageUrl: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^https?:\/\//i.test(pageUrl) || !isSafeCaptureUrl(pageUrl)) return null;
    const r = await deps.fetch(pageUrl);
    if (!r.ok) return null;
    const img = extractMainImage(await r.text(), pageUrl);
    if (!img || !isSafeCaptureUrl(img)) return null;
    return { url: stripUrlSecrets(img) };
  } catch {
    return null;
  }
}

/**
 * Streamable: read the public video API (no auth, no Referer) and return the
 * highest progressive MP4 — a direct, downloadable file. The `files.mp4.url` is a
 * time-signed CloudFront URL (served 200 inline, no redirect), so it is resolved
 * on demand and never cached. Private/login-gated videos carry no `files.mp4.url`
 * and return null (no circumvention).
 */
async function streamable(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^[A-Za-z0-9]+$/.test(id)) return null;
    const r = await deps.fetch(`https://api.streamable.com/videos/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as StreamableResponse;
    const files = j?.files ?? {};
    const url = pinnedUrl(files.mp4?.url, 'streamable.com') ?? pinnedUrl(files['mp4-mobile']?.url, 'streamable.com');
    return url ? { url } : null;
  } catch {
    return null;
  }
}

/**
 * RedGifs. Two public hops, both needing only allowed headers: an anonymous
 * `GET /v2/auth/temporary` yields a short-lived bearer token, then `GET /v2/gifs/<id>`
 * (Authorization: Bearer) returns `gif.urls.hd`. The token is used only for this
 * request and never logged/persisted. The returned media lives on the hotlink-
 * protected `media.redgifs.com` (a background fetch of it would 403 on the missing
 * Referer/User-Agent), so it is handed to the download path where the #197 Referer
 * rewrite + the browser's real UA clear the check — this only resolves the URL.
 */
async function redgifs(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^[a-z0-9]+$/.test(id)) return null;
    const auth = await deps.fetch('https://api.redgifs.com/v2/auth/temporary');
    if (!auth.ok) return null;
    const token = ((await auth.json()) as RedgifsAuth)?.token;
    if (typeof token !== 'string' || !token) return null;
    const r = await deps.fetch(`https://api.redgifs.com/v2/gifs/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as RedgifsGifResponse;
    const urls = j?.gif?.urls ?? j?.urls;
    const media = pinnedUrl(urls?.hd, 'redgifs.com') ?? pinnedUrl(urls?.sd, 'redgifs.com');
    return media ? { url: media } : null;
  } catch {
    return null;
  }
}

const SANKAKU_POST_ID = /^[A-Za-z0-9_-]{1,40}$/;
interface SankakuDetailData { file_url?: string }
interface SankakuDetailResponse { data?: SankakuDetailData; file_url?: string }

/**
 * Sankaku (Tier-2, opt-in authenticated). The grid list endpoint omits the
 * original, so the signed `file_url` is fetched from the per-post detail endpoint,
 * reusing the user's own logged-in session via `credentials:'include'`
 * (cookie-first — no stored credential, no Authorization header handled here). A
 * non-ok response (401/403/429/…) resolves to null so the preview stands — this
 * never throws. The returned `file_url` is host-pinned to sankakucomplex.com
 * (untrusted JSON). Fired only from an authed batch (see resolveOriginalsBatch).
 */
async function sankaku(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!SANKAKU_POST_ID.test(id)) return null;
    const r = await deps.fetch(`https://sankakuapi.com/v2/posts/${encodeURIComponent(id)}?lang=en`, { credentials: 'include' });
    if (!r.ok) return null;
    const j = (await r.json()) as SankakuDetailResponse;
    const d = j?.data ?? j;
    const media = pinnedUrl(d?.file_url, 'sankakucomplex.com');
    return media ? { url: media } : null;
  } catch {
    return null;
  }
}

/**
 * 9GAG. Deterministic, no fetch (like reddit/bsky-video): a video/GIF post's file is
 * id-derived and unsigned, so the universal H.264 rendition
 * `img-9gag-fun.9cache.com/photo/<id>_460sv.mp4` is rebuilt straight from the id.
 * collect.ts only emits this hint when the post has a `<video>`, so an image post
 * (file `<id>_700.jpg`) never reaches here — the mp4 can't 404 by construction.
 * Host-pinned to 9cache.com.
 */
function ninegag(id: string): ResolvedMedia | null {
  if (!/^[A-Za-z0-9]+$/.test(id)) return null;
  const url = `https://img-9gag-fun.9cache.com/photo/${id}_460sv.mp4`;
  return pinnedUrl(url, '9cache.com') ? { url } : null;
}

const TWITCH_CLIP_HOSTS = ['twitchcdn.net', 'twitch.tv'];

/**
 * Twitch clips. A single GQL persisted-query POST (operation name + sha256Hash +
 * Client-ID all externalized to twitch-constants.ts, so they can be bumped without
 * a logic change when Twitch rotates them) returns the clip's mp4 renditions plus
 * a short-lived playback access token. The highest-resolution `sourceURL` is signed
 * with `?sig=&token=` and returned as a direct download. Any missing field —
 * private/expired clip, or a rotated op/hash the request no longer matches —
 * resolves to null (fail-closed: never a URL that would 404/403). The token is used
 * only to build this URL and is never logged or persisted. The `sourceURL` is
 * host-pinned to Twitch's clip CDNs (untrusted JSON). The response is tolerated in
 * both the single-object and array (batched-op) GQL envelope shapes.
 */
async function twitch(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  const vod = /^vod (\d+)$/.exec(id);
  if (vod) return twitchVod(vod[1], deps);
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    const r = await deps.fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationName: TWITCH_GQL_OP,
        variables: { slug: id },
        extensions: { persistedQuery: { version: 1, sha256Hash: TWITCH_GQL_SHA256 } },
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as TwitchGqlResponse | TwitchGqlResponse[];
    const clip = (Array.isArray(j) ? j[0] : j)?.data?.clip;
    const token = clip?.playbackAccessToken;
    if (!token || typeof token.signature !== 'string' || typeof token.value !== 'string') return null;
    let best: { q: number; url: string } | null = null;
    for (const v of clip?.videoQualities ?? []) {
      if (typeof v?.sourceURL === 'string') {
        const q = Number(v.quality) || 0;
        if (!best || q > best.q) best = { q, url: v.sourceURL };
      }
    }
    if (!best) return null;
    const pinned = TWITCH_CLIP_HOSTS.reduce<string | null>((acc, h) => acc ?? pinnedUrl(best!.url, h), null);
    if (!pinned) return null;
    const signed = new URL(pinned);
    signed.searchParams.set('sig', token.signature);
    signed.searchParams.set('token', token.value);
    return { url: signed.href };
  } catch {
    return null;
  }
}

/**
 * Twitch VODs. A single anonymous GQL `PlaybackAccessToken` query (raw, not
 * persisted — see twitch-constants) with the public web Client-ID mints a
 * short-lived sig+token that authorizes the VOD's usher HLS master. That master
 * (`usher.ttvnw.net/vod/<id>.m3u8`) is returned to capture — unlike a clip, a VOD
 * has no single progressive mp4. Any missing token field → null (fail-closed).
 * Sub-only/private VODs still mint a token but usher then serves 403 on it, so the
 * capture fails downstream (no circumvention). The token is used only to build the
 * URL and is never logged/persisted; the master is host-pinned to ttvnw.net.
 */
async function twitchVod(vodId: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    if (!/^\d+$/.test(vodId)) return null;
    const r = await deps.fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationName: 'PlaybackAccessToken',
        query: TWITCH_VOD_GQL_QUERY,
        variables: { isLive: false, login: '', isVod: true, vodID: vodId, playerType: 'site' },
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as TwitchVodGqlResponse | TwitchVodGqlResponse[];
    const token = (Array.isArray(j) ? j[0] : j)?.data?.videoPlaybackAccessToken;
    if (!token || typeof token.signature !== 'string' || typeof token.value !== 'string') return null;
    const master = new URL(`https://usher.ttvnw.net/vod/${encodeURIComponent(vodId)}.m3u8`);
    master.searchParams.set('allow_source', 'true');
    master.searchParams.set('allow_audio_only', 'true');
    master.searchParams.set('player', 'twitchweb');
    master.searchParams.set('platform', 'web');
    master.searchParams.set('sig', token.signature);
    master.searchParams.set('token', token.value);
    return pinnedUrl(master.href, 'ttvnw.net') ? { url: master.href, hls: true } : null;
  } catch {
    return null;
  }
}

interface KickClip { clip_url?: unknown; video_url?: unknown }
interface KickClipResponse { clip?: KickClip }
interface KickVideoResponse { source?: unknown }

/**
 * Kick clips + VODs (opt-in). A clip's mp4 comes from `api/v2/clips/<id>/play`
 * (`clip.clip_url`, else `clip.video_url`); a VOD's HLS master from
 * `api/v1/video/<uuid>` (`source`). Near-1:1 with the Twitch resolver. Both media
 * URLs are host-pinned to `*.kick.com` (clips serve from `clips.kick.com`, VOD
 * masters from `stream.kick.com` — the API JSON is untrusted). Any missing field,
 * non-ok response, or off-CDN URL → null (fail-closed: never a URL that 404/403s).
 * Private/expired media and live channels resolve to null (no circumvention).
 */
async function kick(id: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  const vod = /^video (.+)$/.exec(id);
  if (vod) return kickVod(vod[1], deps);
  if (!/^clip_[A-Za-z0-9]+$/.test(id)) return null;
  try {
    const r = await deps.fetch(`https://kick.com/api/v2/clips/${encodeURIComponent(id)}/play`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const clip = ((await r.json()) as KickClipResponse)?.clip;
    const url = pinnedUrl(typeof clip?.clip_url === 'string' ? clip.clip_url : null, 'kick.com')
      ?? pinnedUrl(typeof clip?.video_url === 'string' ? clip.video_url : null, 'kick.com');
    return url ? { url } : null;
  } catch {
    return null;
  }
}

async function kickVod(uuid: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) return null;
  try {
    const r = await deps.fetch(`https://kick.com/api/v1/video/${encodeURIComponent(uuid)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const source = ((await r.json()) as KickVideoResponse)?.source;
    const pinned = pinnedUrl(typeof source === 'string' ? source : null, 'kick.com');
    return pinned ? { url: pinned, hls: true } : null;
  } catch {
    return null;
  }
}

const SC_BUNDLE_RE = /https:\/\/a-v2\.sndcdn\.com\/assets\/[0-9a-zA-Z._-]+\.js/g;

/** Scrape an anonymous client_id from the track page's app bundles (the id lives in
 *  one of the later bundles, so scan from the end). Null if none carries it. */
async function soundcloudClientId(pageHtml: string, deps: NetDeps): Promise<string | null> {
  const bundles = (pageHtml.match(SC_BUNDLE_RE) ?? []).reverse();
  for (const src of bundles) {
    try {
      const r = await deps.fetch(src);
      if (!r.ok) continue;
      const id = (await r.text()).match(/client_id\s*[:=]\s*"([0-9a-zA-Z]{16,64})"/)?.[1];
      if (id) return id;
    } catch { /* try the next bundle */ }
  }
  return null;
}

/**
 * SoundCloud (opt-in). The hint id is a soundcloud.com track-page URL. SoundCloud
 * needs an anonymous `client_id` (scraped from the page's own JS bundle) for its
 * public `api-v2` endpoints, so: fetch the page → scrape the client_id → `resolve`
 * the URL to the track JSON → pick a transcoding → exchange it for the CDN stream
 * URL. An HLS transcoding is preferred (the capture engine turns SoundCloud's
 * audio-only HLS master into an m4a/mp3 via the existing audio-only path, honouring
 * the user's MP3-transcode setting); a progressive rendition is the single-file
 * fallback. A URL that resolves to a non-track (user/playlist page) → null. The
 * page/track URL is pinned to soundcloud.com and the final stream to sndcdn.com
 * (both API JSON and the resolve target are untrusted). Private/go+ tracks expose
 * no usable transcoding → null (no circumvention).
 */
async function soundcloud(pageUrl: string, deps: NetDeps): Promise<ResolvedMedia | null> {
  try {
    const track = pinnedUrl(pageUrl, 'soundcloud.com');
    if (!track) return null;
    const page = await deps.fetch(track);
    if (!page.ok) return null;
    const clientId = await soundcloudClientId(await page.text(), deps);
    if (!clientId) return null;

    const res = await deps.fetch(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(track)}&client_id=${encodeURIComponent(clientId)}`,
    );
    if (!res.ok) return null;
    const t = (await res.json()) as ScTrack;
    if (t?.kind !== 'track') return null;
    const transcodings = t.media?.transcodings ?? [];

    const hls = transcodings.find((x) => x?.format?.protocol === 'hls' && typeof x.url === 'string');
    const progressive = transcodings.find((x) => x?.format?.protocol === 'progressive' && typeof x.url === 'string');
    const chosen = hls ?? progressive;
    const api = pinnedUrl(chosen?.url, 'soundcloud.com');
    if (!api) return null;

    const sep = api.includes('?') ? '&' : '?';
    const s = await deps.fetch(`${api}${sep}client_id=${encodeURIComponent(clientId)}`);
    if (!s.ok) return null;
    const media = pinnedUrl(((await s.json()) as ScStreamUrl)?.url, 'sndcdn.com');
    if (!media) return null;
    return chosen === hls ? { url: media, hls: true } : { url: media };
  } catch {
    return null;
  }
}

/** Resolve one hint to a final media target, or null on failure. Never throws. */
export async function resolveOriginal(hint: ResolveHint, deps: NetDeps): Promise<ResolvedMedia | null> {
  switch (hint.platform) {
    case 'gallery-page': return galleryPage(hint.id, deps);
    case 'twitter': return twitter(hint.id, deps);
    case 'wallhaven': { const u = await wallhaven(hint.id, deps); return u ? { url: u } : null; }
    case 'unsplash': return { url: unsplash(hint.id) };
    case 'vimeo': return vimeo(hint.id, deps);
    case 'dailymotion': return dailymotion(hint.id, deps);
    case 'rutube': return rutube(hint.id, deps);
    case 'rumble': return rumble(hint.id, deps);
    case 'peertube': return peertube(hint.id, deps);
    case 'loom': return loom(hint.id, deps);
    case 'soundcloud': return soundcloud(hint.id, deps);
    case 'bsky': return bsky(hint.id, deps);
    case 'pinterest': return pinterest(hint.id, deps);
    case 'reddit': return reddit(hint.id);
    case 'flickr': return flickr(hint.id, deps);
    case 'artstation': return artstation(hint.id, deps);
    case 'streamable': return streamable(hint.id, deps);
    case 'redgifs': return redgifs(hint.id, deps);
    case 'sankaku': return sankaku(hint.id, deps);
    case 'twitch': return twitch(hint.id, deps);
    case 'kick': return kick(hint.id, deps);
    case '9gag': return ninegag(hint.id);
    default: return null;
  }
}
