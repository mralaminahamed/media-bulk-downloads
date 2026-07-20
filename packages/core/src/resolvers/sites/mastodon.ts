import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

const MEDIA_RE = /(?:^|\/)media_attachments\/files\//;
const SMALL_RE = /\/small\/([^/]+)$/;

export const mastodonResolver: Resolver = {
  id: 'mastodon',
  match: (u) => MEDIA_RE.test(u.pathname),
  resolve: (u): MediaCandidate[] => {
    if (!SMALL_RE.test(u.pathname)) return [];
    const out = new URL(u.href);
    out.pathname = u.pathname.replace(SMALL_RE, '/original/$1');
    if (out.href === u.href) return [];
    const c: MediaCandidate = { url: out.href, kind: 'image', thumbnailSrc: u.href };
    const ext = imageExtFromUrl(out.href);
    if (ext) c.ext = ext;
    return [c];
  },
};
