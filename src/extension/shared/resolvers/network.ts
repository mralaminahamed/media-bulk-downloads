import { ResolveHint } from '@/types';

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
  request?: { files?: { progressive?: VimeoProgressive[] } };
}

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

async function twitter(id: string, deps: NetDeps): Promise<string | null> {
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
    return pinnedUrl(best?.url, 'twimg.com');
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
async function vimeo(id: string, deps: NetDeps): Promise<string | null> {
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
    return pinnedUrl(best?.url, 'vimeocdn.com');
  } catch {
    return null;
  }
}

/** Resolve one hint to a final URL, or null on failure. Never throws. */
export async function resolveOriginal(hint: ResolveHint, deps: NetDeps): Promise<string | null> {
  switch (hint.platform) {
    case 'twitter': return twitter(hint.id, deps);
    case 'wallhaven': return wallhaven(hint.id, deps);
    case 'unsplash': return unsplash(hint.id);
    case 'vimeo': return vimeo(hint.id, deps);
    default: return null;
  }
}
