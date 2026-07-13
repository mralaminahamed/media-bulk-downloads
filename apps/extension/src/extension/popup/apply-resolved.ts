import { ImageInfo, ResolvedMedia } from '@mbd/core/types';

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
  return { ...item, src: r.url, unresolvedVideo: false, unresolvedImage: false, resolveHint: undefined };
}
