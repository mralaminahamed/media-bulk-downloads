import { MediaCandidate, Resolver } from './types';

const SIZE_SUFFIX = /:(thumb|small|medium|large|orig)$/;
const AVATAR_SIZE = /_(?:normal|bigger|mini|reasonably_small|\d{2,4}x\d{2,4})(?=\.\w+$)/i;

/** Nearest tweet status id from an element (grid cell / timeline link). */
function statusIdFrom(el: Element | undefined): string | null {
  const link =
    el?.closest?.('a[href*="/status/"]') ||
    el?.closest?.('article')?.querySelector?.('a[href*="/status/"]');
  return link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1] ?? null;
}

export const twitterResolver: Resolver = {
  id: 'twitter',
  match: (u) => u.hostname === 'pbs.twimg.com',
  resolve: (u, ctx): MediaCandidate[] => {
    const input = u.href;

    // Video posters are rendered as <img> on the media grid / timeline (no
    // <video> element there). Map them to downloadable video candidates.
    const gif = u.pathname.match(/^\/tweet_video_thumb\/([A-Za-z0-9_-]+)\./);
    if (gif) {
      return [{ url: `https://video.twimg.com/tweet_video/${gif[1]}.mp4`, kind: 'gif', ext: 'mp4', poster: input }];
    }
    if (u.pathname.startsWith('/ext_tw_video_thumb/') || u.pathname.startsWith('/amplify_video_thumb/')) {
      const statusId = statusIdFrom(ctx.el);
      if (statusId) {
        return [{ url: input, kind: 'video', ext: 'mp4', poster: input, resolveHint: { platform: 'twitter', id: statusId }, unresolvedVideo: true }];
      }
      // No status id reachable → fall through so the poster is at least collected.
      return [];
    }

    if (u.pathname.startsWith('/media/')) {
      // Normalize a legacy ":size" suffix that the URL API leaves on pathname.
      const path = u.pathname.replace(SIZE_SUFFIX, '');
      const m = path.match(/^\/media\/([^./]+)(?:\.(\w+))?$/);
      if (!m) return [];
      const id = m[1];
      let fmt = u.searchParams.get('format') || m[2] || 'jpg';
      if (fmt.toLowerCase() === 'webp') fmt = 'jpg';
      const out = new URL(u.href);
      out.pathname = `/media/${id}`;
      out.search = '';
      out.searchParams.set('format', fmt);
      out.searchParams.set('name', 'orig');
      return [{ url: out.href, kind: 'image', ext: fmt, thumbnailSrc: input }];
    }

    if (u.pathname.startsWith('/profile_images/')) {
      const out = new URL(u.href);
      out.pathname = out.pathname.replace(AVATAR_SIZE, '');
      return [{ url: out.href, kind: 'image', thumbnailSrc: input }];
    }

    if (u.pathname.startsWith('/profile_banners/')) {
      const out = new URL(u.href);
      out.pathname = out.pathname.replace(/\/\d{2,4}x\d{2,4}$/, '');
      return [{ url: out.href, kind: 'image', thumbnailSrc: input }];
    }

    if (u.pathname.startsWith('/card_img/')) {
      const out = new URL(u.href);
      if (out.searchParams.has('name')) out.searchParams.set('name', 'orig');
      return [{ url: out.href, kind: 'image', thumbnailSrc: input }];
    }

    return [];
  },
};

/** Twitter GIF: a <video> whose poster is tweet_video_thumb/<ID>.jpg maps to a
 *  downloadable progressive mp4. Returns null for any other video. */
export function twitterGifCandidate(videoEl: Element): MediaCandidate | null {
  const poster = videoEl.getAttribute('poster') || '';
  const m = poster.match(/pbs\.twimg\.com\/tweet_video_thumb\/([A-Za-z0-9_-]+)\.jpg/);
  if (!m) return null;
  return { url: `https://video.twimg.com/tweet_video/${m[1]}.mp4`, kind: 'gif', ext: 'mp4', poster };
}

/** A Twitter REAL video (<video> with an ext_tw_video_thumb/amplify_video_thumb
 *  poster) → a pending item carrying the tweet statusId for opt-in network resolve.
 *  Returns null for GIFs (handled by twitterGifCandidate) or when no statusId is found. */
export function twitterVideoPending(videoEl: Element): MediaCandidate | null {
  const poster = videoEl.getAttribute('poster') || '';
  if (!/pbs\.twimg\.com\/(?:ext_tw_video_thumb|amplify_video_thumb)\//.test(poster)) return null;
  const link = videoEl.closest?.('article')?.querySelector?.('a[href*="/status/"]')
    || videoEl.closest?.('a[href*="/status/"]');
  const id = link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
  if (!id) return null;
  return {
    url: poster, kind: 'video', ext: 'mp4', poster,
    resolveHint: { platform: 'twitter', id }, unresolvedVideo: true,
  };
}
