import { loadHistory, srcsStillOnDisk, DiskState } from '@/extension/shared/storage/history';
import { SrcKeySet } from '@/extension/shared/collection/canonical';

/**
 * Canonical keys of every history entry whose file is still on disk (or whose
 * on-disk state is unknown), for skipping re-downloads. Mirrors the
 * GET_DOWNLOADED_SRCS handler: loadHistory + one chrome.downloads.search(limit:0)
 * → stateById → srcsStillOnDisk. Degrades to an empty set on any error so a dedup
 * hiccup never blocks a download.
 */
export async function downloadedOnDiskKeys(): Promise<SrcKeySet> {
  try {
    const historyEntries = await loadHistory();
    // limit:0 = no row cap (the default 1000 most-recent could drop older
    // extension entries and re-offer still-on-disk files).
    const items = await chrome.downloads.search({ limit: 0 });
    const existsById = new Map(items.map((it) => [it.id, it.exists]));
    const stateById = (id: number): DiskState =>
      existsById.has(id) ? (existsById.get(id) ? 'exists' : 'deleted') : 'unknown';
    return SrcKeySet.from(srcsStillOnDisk(historyEntries, stateById));
  } catch {
    return SrcKeySet.from([]);
  }
}
