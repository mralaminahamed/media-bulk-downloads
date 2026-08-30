import { currentSettings } from '@/extension/background/state';
import { platform } from '@/extension/platform';

/** Outcome of a download batch, used to report the real status to the user. */
export interface DownloadResult {
  /** How many items reached a terminal state (done + failed). */
  total: number;
  /** How many actually finished downloading. */
  succeeded: number;
  /** How many ended failed. */
  failed: number;
  /** How many were skipped as already-on-disk duplicates. */
  skipped: number;
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
  if (!currentSettings.notifyOnComplete || !platform.notifier.available || (result.total === 0 && result.skipped === 0)) return;
  platform.notifier.notify({ title: 'Media Bulk Downloads', message: downloadStatusMessage(result) });
}
