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
  video?: TwitterMediaDetail;
}

interface WallhavenResponse {
  data?: { path?: string };
}

/**
 * Verbatim from react-tweet's getToken (copied in Task 2 Step 1).
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
    const details = j?.mediaDetails ?? (j?.video ? [j.video] : []);
    let best: { bitrate: number; url: string } | null = null;
    for (const d of details) {
      for (const v of d?.video_info?.variants ?? []) {
        if (v?.content_type === 'video/mp4' && typeof v.url === 'string') {
          const bitrate = Number(v.bitrate) || 0;
          if (!best || bitrate > best.bitrate) best = { bitrate, url: v.url };
        }
      }
    }
    return best?.url ?? null;
  } catch {
    return null;
  }
}

async function wallhaven(id: string, deps: NetDeps): Promise<string | null> {
  try {
    const r = await deps.fetch(`https://wallhaven.cc/api/v1/w/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as WallhavenResponse;
    return typeof j?.data?.path === 'string' ? j.data.path : null;
  } catch {
    return null;
  }
}

function unsplash(id: string): string {
  return `https://unsplash.com/photos/${encodeURIComponent(id)}/download`;
}

/** Resolve one hint to a final URL, or null on failure. Never throws. */
export async function resolveOriginal(hint: ResolveHint, deps: NetDeps): Promise<string | null> {
  switch (hint.platform) {
    case 'twitter': return twitter(hint.id, deps);
    case 'wallhaven': return wallhaven(hint.id, deps);
    case 'unsplash': return unsplash(hint.id);
    default: return null;
  }
}
