import { upgradeToOriginal } from '@mbd/core/collection/imageUrl';
import { imageExtFromUrl } from '@mbd/core/collection/mediaType';
import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

const PHOTO = /^\/\d+\/(\d+)_[0-9a-z]+(?:_[a-z0-9]+)?\.(?:jpe?g|png|gif)$/i;

/**
 * Flickr. Owns the `*.staticflickr.com` CDN so it runs before the generic resolver:
 *  - the network-free candidate is the `_b` (1024) upgrade the generic rule already
 *    does (delegated to `upgradeToOriginal` — same display secret, and the background
 *    right-click path uses it too);
 *  - plus a `flickr` resolveHint so the opt-in tier can fetch a genuinely larger size
 *    (`_h`/`_k`/`_6k` …), which is served under a DIFFERENT secret and so cannot be
 *    built offline from the thumbnail URL.
 */
export const flickrResolver: Resolver = {
  id: 'flickr',
  hosts: ['staticflickr.com'],
  match: (u) => u.hostname === 'staticflickr.com' || u.hostname.endsWith('.staticflickr.com'),
  resolve: (u): MediaCandidate[] => {
    const id = u.pathname.match(PHOTO)?.[1];
    if (!id) return [];

    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    const ext = imageExtFromUrl(original);
    if (ext) c.ext = ext;
    c.resolveHint = { platform: 'flickr', id };
    return [c];
  },
};
