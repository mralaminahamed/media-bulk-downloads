import { upgradeToOriginal } from '@/extension/shared/collection/imageUrl';
import { imageExtFromUrl } from '@/extension/shared/collection/mediaType';
import { MediaCandidate, Resolver } from '../types';

// staticflickr path: /<server>/<photoid>_<secret>[_<size>].<ext>. The photo id is
// the first digit run after the server; the secret differs per size class, so the
// id (not a size-swapped URL) is what the network tier needs.
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
    if (!id) return []; // not a photo asset (buddyicons, etc.) -> generic

    const { original, thumbnail } = upgradeToOriginal(u.href);
    const c: MediaCandidate = { url: original, kind: 'image' };
    if (thumbnail) c.thumbnailSrc = thumbnail;
    const ext = imageExtFromUrl(original);
    if (ext) c.ext = ext;
    c.resolveHint = { platform: 'flickr', id };
    return [c];
  },
};
