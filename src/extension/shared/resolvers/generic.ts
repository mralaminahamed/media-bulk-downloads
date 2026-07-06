import { upgradeToOriginal } from '@/extension/shared/collection/imageUrl';
import { imageExtFromUrl } from '@/extension/shared/collection/mediaType';
import { MediaCandidate, Resolver } from './types';

/** Fallback resolver: today's de-proxy + CDN-rule engine, image-only. */
export const genericResolver: Resolver = {
  id: 'generic',
  match: () => true,
  resolve: (u) => {
    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    // Keep the real file extension from the upgraded URL (e.g. Pixabay `.jpg`),
    // so the download name matches the source rather than the canonical type.
    const ext = imageExtFromUrl(original);
    if (ext) c.ext = ext;
    return [c];
  },
};
