import { HistoryEntry, ImageInfo } from '@mbd/core/types';
import { buildDownloadFilename } from '@mbd/core/collection/download-name';
import { partitionByDownloaded, uniquifyBatchNames } from '@mbd/core/collection/download-dedupe';
import { recordDownloads } from '@mbd/storage/history';
import { currentSettings } from '@/extension/background/state';
import { downloadedOnDiskKeys } from '@/extension/background/download/downloaded-keys';

/**
 * Downloads each eligible image and records the successful ones to history,
 * tagged with the source page they came from. Failures (a Chrome-reported
 * `lastError`, or no `downloadId`) are silently skipped — nothing is recorded
 * for them.
 */
/** Outcome of a download batch, used to report the real status to the popup. */
export interface DownloadResult {
  /** How many items were actually attempted (eligible, after any duplicate skip). */
  total: number;
  /** How many downloads chrome actually started (returned a downloadId). */
  succeeded: number;
  /** How many failed to start (no id / runtime.lastError). */
  failed: number;
  /** How many were skipped as already-on-disk duplicates. */
  skipped: number;
}

export async function downloadAndRecord(
  eligible: ImageInfo[],
  sourcePage: { url: string; title?: string } | undefined,
  opts: { skipDuplicates?: boolean } = {},
): Promise<DownloadResult> {
  let toDownload = eligible;
  let skipped = 0;
  if (opts.skipDuplicates) {
    const onDiskKeys = await downloadedOnDiskKeys();
    const part = partitionByDownloaded(eligible, onDiskKeys);
    toDownload = part.keep;
    skipped = part.skipped.length;
  }
  // De-collide names within the batch (image.png, image-2.png) so distinct
  // images sharing a name don't rely on Chrome's " (2)".
  const paths = uniquifyBatchNames(
    toDownload.map((image, index) => buildDownloadFilename(image, index, currentSettings, sourcePage?.url)),
  );
  const entries = await Promise.all(
    toDownload.map(
      (image, index) =>
        new Promise<HistoryEntry | null>((resolve) => {
          const filename = paths[index];
          chrome.downloads.download(
            { url: image.src, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
            (downloadId) => {
              if (chrome.runtime.lastError || downloadId === undefined) {
                resolve(null);
                return;
              }
              resolve({
                src: image.src,
                filename: filename.split('/').pop() ?? filename,
                kind: image.kind,
                type: image.type,
                thumbnailSrc: image.thumbnailSrc ?? image.poster ?? image.src,
                sourcePageUrl: sourcePage?.url ?? '',
                sourcePageTitle: sourcePage?.title,
                time: Date.now(),
                downloadId,
              });
            },
          );
        }),
    ),
  );
  const recorded = entries.filter((e): e is HistoryEntry => e !== null);
  await recordDownloads(recorded);
  const result: DownloadResult = {
    total: toDownload.length,
    succeeded: recorded.length,
    failed: toDownload.length - recorded.length,
    skipped,
  };
  notifyBatchDone(result);
  return result;
}

/** `1 file` / `N files` — correct singular/plural for a count. */
function fileCount(n: number): string {
  return `${n} file${n === 1 ? '' : 's'}`;
}

/** Human-readable final status for a finished download batch. */
export function downloadStatusMessage(r: DownloadResult): string {
  if (r.total === 0) return r.skipped > 0 ? `Nothing new — ${r.skipped} already saved.` : 'No files to download.';
  const tail = r.skipped > 0 ? ` (${r.skipped} skipped — already saved)` : '';
  if (r.succeeded === 0) return `Couldn't download ${fileCount(r.total)}.${tail}`;
  if (r.failed === 0) return `Downloaded ${fileCount(r.succeeded)}.${tail}`;
  return `Downloaded ${r.succeeded} of ${fileCount(r.total)} — ${r.failed} failed.${tail}`;
}

/**
 * Desktop toast when a download batch finishes — the only feedback for downloads
 * started from a keyboard command or the context menu (no popup is open). Opt-in
 * (`notifyOnComplete`) and gated on the optional `notifications` permission being
 * granted, so it's silent unless the user asked for it.
 */
export function notifyBatchDone(result: DownloadResult): void {
  if (!currentSettings.notifyOnComplete || !chrome.notifications || (result.total === 0 && result.skipped === 0)) return;
  chrome.notifications.create(
    {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title: 'Media Bulk Downloads',
      message: downloadStatusMessage(result),
    },
    () => void chrome.runtime.lastError, // notifications perm not granted → ignore
  );
}
