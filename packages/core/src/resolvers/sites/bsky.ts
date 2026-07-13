import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '../types';

const HOST = 'cdn.bsky.app';

// Bluesky/atproto image CDN path: /img/<rendition>/plain/<did>/<cid>@<fmt>
// <cid> is the blob CID (the same id com.atproto.sync.getBlob takes) and <fmt>
// is the encoded format (jpeg/png/webp) with no dotted extension.
const IMG_RE = /^\/img\/([a-z_]+)\/plain\/(did:(?:plc|web):[^/]+)\/([^/@]+)@[a-z0-9]+$/i;

// A downscaled rendition mapped to its largest network-free CDN sibling.
// feed_fullsize / avatar / banner are already the max the CDN serves.
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
    if (!m) return []; // not a recognized img path -> let genericResolver handle it
    const [, rendition, did, cid] = m;

    // feed_video_blob is only the video's poster still. Surface an unresolved
    // video whose real file (an HLS master) comes from the opt-in network tier;
    // never fall through to the still image (it would leak a single frame).
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
    // The blob CID uniquely identifies the upload; the opt-in network tier can
    // upgrade this re-encoded CDN rendition to the true original via getBlob.
    c.resolveHint = { platform: 'bsky', id: `blob ${did} ${cid}` };
    return [c];
  },
};
