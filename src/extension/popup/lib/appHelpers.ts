import { DeepScanStopReason, ImageInfo } from '@/types';
import { isPendingOrStream } from '../../shared/collection/filters';

// Concurrent HEAD requests when enriching remote image sizes.
export const SIZE_FETCH_CONCURRENCY = 6;

/**
 * A user-facing note when a deep scan stopped at one of its caps rather than
 * running dry — so the user knows more media may exist below. Natural completion
 * and user-aborted scans return null (no note).
 */
export function deepScanCapMessage(reason: DeepScanStopReason | undefined, count: number): string | null {
  switch (reason) {
    case 'max-items': return `Stopped at the ${count}-item limit — some media may remain.`;
    case 'max-time': return 'Stopped at the time limit — some media may remain.';
    case 'max-scrolls': return 'Stopped at the scroll limit — some media may remain.';
    default: return null;
  }
}

/** Items the user can actually download/zip now — pending videos, pending images,
 *  and HLS streams (which are captured individually, not fetched as one file) are
 *  excluded. */
export const downloadable = (list: ImageInfo[]): ImageInfo[] => list.filter((i) => !isPendingOrStream(i));

/** Pending videos that still carry a resolve hint — the set "Get all videos" acts on. */
export const pendingVideos = (list: ImageInfo[]): ImageInfo[] =>
  list.filter((i) => i.kind === 'video' && i.unresolvedVideo && !!i.resolveHint);
