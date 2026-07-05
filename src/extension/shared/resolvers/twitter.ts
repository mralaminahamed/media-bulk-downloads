import { MediaCandidate, Resolver } from './types';

const SIZE_SUFFIX = /:(thumb|small|medium|large|orig)$/;
const AVATAR_SIZE = /_(?:normal|bigger|mini|reasonably_small|\d{2,4}x\d{2,4})(?=\.\w+$)/i;

function idFromStatusUrl(url: string | null | undefined): string | null {
  return url?.match(/\/status\/(\d+)/)?.[1] ?? null;
}

/**
 * A tweet's OWN status id within a scope (its `<article>` / media cell). When a
 * tweet quotes or embeds another, the article holds several `/status/` links;
 * prefer the permalink that carries the timestamp (`<time>`) or a `/photo|/video`
 * media segment — those point to THIS tweet, not the quoted one — before falling
 * back to the first link.
 */
function ownStatusId(scope: Element | null | undefined): string | null {
  const links = scope?.querySelectorAll ? [...scope.querySelectorAll('a[href*="/status/"]')] : [];
  if (!links.length) return null;
  const pick =
    links.find((a) => a.querySelector('time')) ||
    links.find((a) => /\/status\/\d+\/(?:photo|video|analytics)\b/.test(a.getAttribute('href') || '')) ||
    links[0];
  return idFromStatusUrl(pick?.getAttribute('href'));
}

/**
 * Nearest tweet status id for an element: a `/status/` link it sits inside (the
 * media-grid cell wraps the poster in one), else the enclosing tweet article's
 * own permalink, else the page URL's status id.
 */
function nearestStatusId(el: Element | undefined, pageUrl?: string): string | null {
  const direct = idFromStatusUrl(el?.closest?.('a[href*="/status/"]')?.getAttribute('href'));
  if (direct) return direct;
  return ownStatusId(el?.closest?.('article')) ?? idFromStatusUrl(pageUrl);
}

export const twitterResolver: Resolver = {
  id: 'twitter',
  match: (u) => u.hostname === 'pbs.twimg.com',
  resolve: (u, ctx): MediaCandidate[] => {
    const input = u.href;

    // Video posters are rendered as <img> on the media grid / timeline (no
    // <video> element there). Map them to downloadable video candidates.
    // GIF thumbs come both as /tweet_video_thumb/<ID>.jpg and, on the media grid,
    // as /tweet_video_thumb/<ID> with the format in the query — so the extension
    // is optional. The id class excludes '.' and '/', so it stops on its own.
    const gif = u.pathname.match(/^\/tweet_video_thumb\/([A-Za-z0-9_-]+)/);
    if (gif) {
      return [{ url: `https://video.twimg.com/tweet_video/${gif[1]}.mp4`, kind: 'gif', ext: 'mp4', poster: input }];
    }
    if (u.pathname.startsWith('/ext_tw_video_thumb/') || u.pathname.startsWith('/amplify_video_thumb/')) {
      // Always a VIDEO — never fall through to the image path. Twitter renders the
      // same poster both as an <img> and as a CSS background-image; if the poster
      // ever became an image, it would leak in as a duplicate still frame. A
      // status id (from the cell's /status/ link) enables opt-in mp4 resolution;
      // without one it's a pending video the app won't display.
      const statusId = nearestStatusId(ctx.el, ctx.pageUrl);
      const candidate: MediaCandidate = { url: input, kind: 'video', ext: 'mp4', poster: input, unresolvedVideo: true };
      if (statusId) candidate.resolveHint = { platform: 'twitter', id: statusId };
      return [candidate];
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
  const m = poster.match(/pbs\.twimg\.com\/tweet_video_thumb\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  return { url: `https://video.twimg.com/tweet_video/${m[1]}.mp4`, kind: 'gif', ext: 'mp4', poster };
}

/** A Twitter REAL video (<video> with an ext_tw_video_thumb/amplify_video_thumb
 *  poster) → a pending video item. The tweet statusId (from a nearby /status/
 *  link, else the page URL) enables opt-in mp4 resolution; without one it stays
 *  a poster-only pending video the user can see but not yet download.
 *  Returns null only for a non-video/GIF poster (the GIF path handles those). */
export function twitterVideoPending(videoEl: Element, pageUrl?: string): MediaCandidate | null {
  const poster = videoEl.getAttribute('poster') || '';
  if (!/pbs\.twimg\.com\/(?:ext_tw_video_thumb|amplify_video_thumb)\//.test(poster)) return null;
  const id = nearestStatusId(videoEl, pageUrl);
  const candidate: MediaCandidate = { url: poster, kind: 'video', ext: 'mp4', poster, unresolvedVideo: true };
  if (id) candidate.resolveHint = { platform: 'twitter', id };
  return candidate;
}
