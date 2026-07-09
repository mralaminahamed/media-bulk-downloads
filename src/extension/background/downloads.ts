import { HistoryEntry, ImageInfo } from '@/types';
import { buildDownloadFilename } from '../shared/collection/download-name';
import { recordDownloads } from '../shared/storage/history';
import { currentSettings } from './state';

/**
 * Downloads each eligible image and records the successful ones to history,
 * tagged with the source page they came from. Failures (a Chrome-reported
 * `lastError`, or no `downloadId`) are silently skipped — nothing is recorded
 * for them.
 */
/** Outcome of a download batch, used to report the real status to the popup. */
export interface DownloadResult {
  /** How many items were eligible after filtering. */
  total: number;
  /** How many downloads chrome actually started (returned a downloadId). */
  succeeded: number;
  /** How many failed to start (no id / runtime.lastError). */
  failed: number;
}

export async function downloadAndRecord(
  eligible: ImageInfo[],
  sourcePage: { url: string; title?: string } | undefined,
): Promise<DownloadResult> {
  const entries = await Promise.all(
    eligible.map(
      (image, index) =>
        new Promise<HistoryEntry | null>((resolve) => {
          const filename = buildDownloadFilename(image, index, currentSettings, sourcePage?.url);
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
  const result = { total: eligible.length, succeeded: recorded.length, failed: eligible.length - recorded.length };
  notifyBatchDone(result);
  return result;
}

/** `1 file` / `N files` — correct singular/plural for a count. */
function fileCount(n: number): string {
  return `${n} file${n === 1 ? '' : 's'}`;
}

/** Human-readable final status for a finished download batch. */
export function downloadStatusMessage(r: DownloadResult): string {
  if (r.total === 0) return 'No files to download.';
  if (r.succeeded === 0) return `Couldn't download ${fileCount(r.total)}.`;
  if (r.failed === 0) return `Downloaded ${fileCount(r.succeeded)}.`;
  return `Downloaded ${r.succeeded} of ${fileCount(r.total)} — ${r.failed} failed.`;
}

/**
 * Desktop toast when a download batch finishes — the only feedback for downloads
 * started from a keyboard command or the context menu (no popup is open). Opt-in
 * (`notifyOnComplete`) and gated on the optional `notifications` permission being
 * granted, so it's silent unless the user asked for it.
 */
export function notifyBatchDone(result: DownloadResult): void {
  if (!currentSettings.notifyOnComplete || !chrome.notifications || result.total === 0) return;
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
