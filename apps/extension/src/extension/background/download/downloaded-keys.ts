import { loadHistory, srcsStillOnDisk, diskState } from '@mbd/storage/history';
import { SrcKeySet } from '@mbd/core/collection/canonical';
import { platform } from '@/extension/platform';

/**
 * Canonical keys of every history entry whose file is still on disk (or whose
 * on-disk state is unknown), for skipping re-downloads. Mirrors the
 * GET_DOWNLOADED_SRCS handler: loadHistory + one platform.downloader.search(limit:0)
 * → stateById → srcsStillOnDisk. Degrades to an empty set on any error so a dedup
 * hiccup never blocks a download.
 */
export async function downloadedOnDiskKeys(): Promise<SrcKeySet> {
  try {
    const historyEntries = await loadHistory();
    const items = await platform.downloader.search({ limit: 0 });
    const existsById = new Map(items.map((it) => [it.id, it.exists === true]));
    return SrcKeySet.from(srcsStillOnDisk(historyEntries, (id) => diskState(id, existsById)));
  } catch {
    return SrcKeySet.from([]);
  }
}
