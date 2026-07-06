import { ResolveHint } from '@/types';
import { igMediaFromHtml, pinIgUrl } from '@/extension/shared/ig-media-sniff';

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
 * Fetch a reel/post's own page with the user's session cookies and read the real
 * mp4 out of its embedded JSON. Read-only: it GETs a page the user could open
 * themselves — no forged private-API request. Returns null when the page ships no
 * video (e.g. Instagram gated it, or it defers the media to a client GraphQL call
 * the plain fetch can't trigger) — the caller then reports "couldn't fetch".
 */
async function instagram(code: string, deps: NetDeps): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return null;
  for (const path of [`reel/${code}`, `p/${code}`]) {
    try {
      const r = await deps.fetch(`https://www.instagram.com/${path}/`, { credentials: 'include' });
      if (!r.ok) continue;
      const entries = igMediaFromHtml(await r.text());
      const match =
        entries.find((e) => e.code === code && e.kind === 'video' && !e.pending) ??
        entries.find((e) => e.kind === 'video' && !e.pending);
      const url = pinIgUrl(match?.url);
      if (url) return url;
    } catch {
      /* try the next path / give up */
    }
  }
  return null;
}

/** Resolve one hint to a final URL, or null on failure. Never throws. */
export async function resolveOriginal(hint: ResolveHint, deps: NetDeps): Promise<string | null> {
  switch (hint.platform) {
    case 'twitter': return twitter(hint.id, deps);
    case 'wallhaven': return wallhaven(hint.id, deps);
    case 'unsplash': return unsplash(hint.id);
    case 'instagram': return instagram(hint.id, deps);
    default: return null;
  }
}
