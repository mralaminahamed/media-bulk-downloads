import { upgradeToOriginal } from '@/extension/shared/imageUrl';
import { MediaCandidate, Resolver } from './types';

/** Fallback resolver: today's de-proxy + CDN-rule engine, image-only. */
export const genericResolver: Resolver = {
  id: 'generic',
  match: () => true,
  resolve: (u) => {
    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    return [c];
  },
};
