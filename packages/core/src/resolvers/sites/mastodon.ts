import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

// A Mastodon (and compatible) attachment path, on any instance's media host:
//   …/media_attachments/files/<nested digits>/<size>/<hash>.<ext>
// The <hash>.<ext> basename is identical across sizes, so a /small/ → /original/
// swap is 404-safe with no extension guessing.
const MEDIA_RE = /(?:^|\/)media_attachments\/files\//;
const SMALL_RE = /\/small\/([^/]+)$/;

export const mastodonResolver: Resolver = {
  id: 'mastodon',
  // Broad: match owns "is this a Mastodon media URL"; resolve owns the size
  // decision, so an already-/original/ URL is routed here and returns [].
  match: (u) => MEDIA_RE.test(u.pathname),
  resolve: (u): MediaCandidate[] => {
    if (!SMALL_RE.test(u.pathname)) return []; // already /original/, /static/, etc.
    const out = new URL(u.href);
    out.pathname = u.pathname.replace(SMALL_RE, '/original/$1');
    if (out.href === u.href) return [];
    const c: MediaCandidate = { url: out.href, kind: 'image', thumbnailSrc: u.href };
    const ext = imageExtFromUrl(out.href);
    if (ext) c.ext = ext;
    return [c];
  },
};
