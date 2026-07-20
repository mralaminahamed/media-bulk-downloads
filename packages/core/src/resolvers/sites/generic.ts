import { upgradeToOriginal } from '@mbd/core/collection/imageUrl';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

/** Fallback resolver: today's de-proxy + CDN-rule engine, image-only. */
export const genericResolver: Resolver = {
  id: 'generic',
  match: () => true,
  resolve: (u) => {
    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    const ext = imageExtFromUrl(original);
    if (ext) c.ext = ext;
    return [c];
  },
};
