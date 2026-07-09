import { CaptureRunResult, ImageInfo } from '@/types';
import { buildDownloadFilename } from '../../shared/collection/download-name';
import { recordDownloads } from '../../shared/storage/history';
import { STREAM_MAX_BYTES, STREAM_TARGET_HEIGHT } from '../../shared/download/stream/capture-constants';
import { currentSettings } from '../state';
import { notifyBatchDone } from './downloads';

/**
 * Per-capture tab id, keyed by the capture's runId, so a CAPTURE_PROGRESS
 * broadcast from the offscreen doc (which content scripts never receive via
 * runtime.sendMessage) is relayed to the RIGHT tab's bubble even when several
 * captures run concurrently in the shared offscreen doc. An entry is added when a
 * capture starts and removed when it ends; a runId with no entry (a popup
 * capture, whose sender.tab is undefined) simply relays nowhere — the popup gets
 * the broadcast directly and filters by runId itself.
 */
export const captureRunTabs = new Map<string, number>();

const OFFSCREEN_URL = 'offscreen.html';

/**
 * Ensure the single offscreen document exists (creating it on first capture and
 * reusing it after). Tolerates the concurrent-create race: two rapid captures can
 * both see no document, and the second createDocument throws — if a document now
 * exists, that is fine.
 */
export async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Assemble HLS/DASH stream segments into a downloadable video file.',
    });
  } catch (e) {
    if (!(await chrome.offscreen.hasDocument())) throw e;
  }
}

/**
 * Capture one HLS/DASH stream item to a downloaded file: run the offscreen
 * engine, then hand the muxed BLOB (never the manifest URL) to chrome.downloads.
 * Shared by the popup's CAPTURE_STREAM handler and the bulk "Download all" path,
 * so neither ever saves the raw manifest text. Returns a status descriptor.
 */
export async function captureStreamToFile(
  item: ImageInfo,
  sourcePage: { url: string; title?: string } | undefined,
  runId: string,
): Promise<
  | { ok: true; filename: string; saved: boolean; segmentCount: number; muxedAudio: boolean }
  | { ok: false; code: string }
> {
  await ensureOffscreen();
  const result = (await chrome.runtime.sendMessage({
    type: 'CAPTURE_RUN',
    runId,
    manifestUrl: item.hlsManifest,
    engine: item.type === 'mpd' ? 'dash' : 'hls',
    quality: STREAM_TARGET_HEIGHT,
    maxBytes: STREAM_MAX_BYTES,
  })) as CaptureRunResult | undefined;
  if (!result || !result.ok) return { ok: false, code: result?.ok === false ? result.code : 'unknown' };
  const filename = buildDownloadFilename({ ...item, ext: result.ext }, 0, currentSettings, sourcePage?.url);
  const downloadId = await new Promise<number | undefined>((resolve) =>
    chrome.downloads.download(
      { url: result.blobUrl, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
      (id) => resolve(chrome.runtime.lastError ? undefined : id),
    ),
  );
  const saved = downloadId !== undefined;
  // A capture can finish after the popup closes, so record history + notify HERE
  // — both were previously skipped for the entire capture path (no "already
  // downloaded" mark / dedup, and no finish notification for its stated use case).
  if (downloadId !== undefined) {
    void recordDownloads([{
      src: item.src,
      filename: filename.split('/').pop() ?? filename,
      kind: item.kind,
      type: result.ext ?? item.type,
      thumbnailSrc: item.thumbnailSrc ?? item.poster ?? item.src,
      sourcePageUrl: sourcePage?.url ?? '',
      sourcePageTitle: sourcePage?.title,
      time: Date.now(),
      downloadId,
    }]);
  }
  notifyBatchDone({ total: 1, succeeded: saved ? 1 : 0, failed: saved ? 0 : 1 });
  return { ok: true, filename, saved, segmentCount: result.segmentCount, muxedAudio: result.muxedAudio };
}
