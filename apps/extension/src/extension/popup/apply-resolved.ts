import { ImageInfo, ResolvedMedia } from '@mbd/core/types';
import { getImageType } from '@mbd/core/collection/imageUrl';

/**
 * Turn a resolve result into the swapped grid item. A direct URL swaps in place
 * (now a downloadable file). An HLS manifest becomes a capturable stream — but
 * ONLY when stream capture is enabled; with it off, return null to leave the item
 * pending, since resolving to a stream the user can't capture would make the tile
 * vanish under the HLS filter.
 */
export function applyResolved(item: ImageInfo, r: ResolvedMedia, captureHls: boolean): ImageInfo | null {
  if (r.hls) {
    if (!captureHls) return null;
    return { ...item, src: r.url, hlsManifest: r.url, type: 'm3u8', unresolvedVideo: false, resolveHint: undefined };
  }
  // A pending item resolved to a real image (twitter photo, gallery-page #287)
  // carries type 'unknown'; derive the real format from the resolved URL so the
  // download gets the correct extension (never a .jpg on a real .png) and the
  // format filter buckets it right. Only fill an unknown type — never override a
  // resolver that already set one.
  const type = item.type === 'unknown' && item.kind === 'image' ? getImageType(r.url) : item.type;
  return { ...item, src: r.url, type, unresolvedVideo: false, unresolvedImage: false, resolveHint: undefined };
}
