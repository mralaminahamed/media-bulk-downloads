import { CaptureRunResult, ImageInfo } from '@mbd/core/types';
import { buildDownloadFilename } from '@mbd/core/collection/download-name';
import { recordDownloads } from '@mbd/storage/history';
import { STREAM_MAX_BYTES } from '@mbd/core/download/stream/capture-constants';
import { streamQualityToEngine } from '@mbd/core/download/stream/quality';
import { currentSettings } from '@/extension/background/state';
import { notifyBatchDone } from '@/extension/background/download/downloads';

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
  // Firefox has no chrome.offscreen. The `!import.meta.env.FIREFOX` guard is a
  // build-time constant, so esbuild dead-code-eliminates the whole block (and its
  // chrome.offscreen.* references) from the Firefox bundle — AMO would otherwise
  // flag the unsupported API. Stream capture bails earlier on Firefox (see
  // captureStreamToFile), so this is never reached there.
  if (!import.meta.env.FIREFOX) {
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
  // HLS/DASH capture assembles segments in a chrome.offscreen blob document, which
  // Firefox does not implement — surface a clean "unsupported" result there rather
  // than sending a CAPTURE_RUN to a document that can never exist.
  if (import.meta.env.FIREFOX) return { ok: false, code: 'unsupported_browser' };
  await ensureOffscreen();
  const result = (await chrome.runtime.sendMessage({
    type: 'CAPTURE_RUN',
    runId,
    manifestUrl: item.hlsManifest,
    engine: item.type === 'mpd' ? 'dash' : 'hls',
    // The user's global "Stream quality" preference (#288); 'auto' keeps the
    // target-height default, so nothing changes unless they pick a rendition.
    quality: streamQualityToEngine(currentSettings.streamQuality),
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
  notifyBatchDone({ total: 1, succeeded: saved ? 1 : 0, failed: saved ? 0 : 1, skipped: 0 });
  return { ok: true, filename, saved, segmentCount: result.segmentCount, muxedAudio: result.muxedAudio };
}
