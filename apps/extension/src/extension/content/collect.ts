import { HOST_ID } from '@/extension/bubble/mount';
import { collectMedia as coreCollectMedia, type ScanRoot } from '@mbd/core/collection/collect';

export * from '@mbd/core/collection/collect';

export function collectMedia(
  scanRoots?: ScanRoot[],
  opts?: { smartPageDefaults?: boolean; resolveOriginals?: boolean },
): ReturnType<typeof coreCollectMedia> {
  return coreCollectMedia(scanRoots, { ...opts, excludeHostId: HOST_ID });
}
