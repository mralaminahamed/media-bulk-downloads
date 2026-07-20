import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

const HOST = 'cdn.bsky.app';

const IMG_RE = /^\/img\/([a-z_]+)\/plain\/(did:(?:plc|web):[^/]+)\/([^/@]+)@[a-z0-9]+$/i;

const UPGRADE: Record<string, string> = {
  feed_thumbnail: 'feed_fullsize',
  avatar_thumbnail: 'avatar',
};

export const bskyResolver: Resolver = {
  id: 'bsky',
  hosts: ['bsky.app'],
  match: (u) => u.hostname === HOST,
  resolve: (u): MediaCandidate[] => {
    const m = IMG_RE.exec(u.pathname);
    if (!m) return [];
    const [, rendition, did, cid] = m;

    if (rendition === 'feed_video_blob') {
      return [{
        url: u.href,
        kind: 'video',
        unresolvedVideo: true,
        poster: u.href,
        resolveHint: { platform: 'bsky', id: `video ${did} ${cid}` },
      }];
    }

    const out = new URL(u.href);
    const upgraded = UPGRADE[rendition];
    if (upgraded) out.pathname = out.pathname.replace(`/img/${rendition}/`, `/img/${upgraded}/`);

    const c: MediaCandidate = { url: out.href, kind: 'image' };
    if (out.href !== u.href) c.thumbnailSrc = u.href;
    const ext = imageExtFromUrl(out.href);
    if (ext) c.ext = ext;
    c.resolveHint = { platform: 'bsky', id: `blob ${did} ${cid}` };
    return [c];
  },
};
