import { AudioFormat, ImageInfo } from '@mbd/core/types';
import { buildDownloadFilename } from '@mbd/core/collection/download-name';
import { recordDownloads } from '@mbd/storage/history';
import { STREAM_MAX_BYTES } from '@mbd/core/download/stream/capture-constants';
import { streamQualityToEngine } from '@mbd/core/download/stream/quality';
import { currentSettings } from '@/extension/background/state';
import { notifyBatchDone } from '@/extension/background/download/downloads';
import { platform } from '@/extension/platform';

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

/**
 * Capture one HLS/DASH stream item to a downloaded file: run the capture host
 * (Chrome: offscreen document; Firefox/Safari: in-process), then hand the muxed
 * BLOB (never the manifest URL) to the downloader. Shared by the popup's
 * CAPTURE_STREAM handler and the bulk "Download all" path, so neither ever saves
 * the raw manifest text. Returns a status descriptor.
 */
export async function captureStreamToFile(
  item: ImageInfo,
  sourcePage: { url: string; title?: string } | undefined,
  runId: string,
  audioOnly = false,
  audioFormatOverride?: AudioFormat,
  qualityOverride?: number | 'highest' | 'lowest',
): Promise<
  | { ok: true; filename: string; saved: boolean; segmentCount: number; muxedAudio: boolean }
  | { ok: false; code: string }
> {
  if (!platform.captureHost.available) return { ok: false, code: 'unsupported_browser' };
  const audioFormat = audioOnly ? (audioFormatOverride ?? currentSettings.audioFormat) : 'm4a';
  const result = await platform.captureHost.run({
    runId,
    manifestUrl: item.hlsManifest ?? '',
    engine: item.type === 'mpd' ? 'dash' : 'hls',
    quality: qualityOverride ?? streamQualityToEngine(currentSettings.streamQuality),
    maxBytes: STREAM_MAX_BYTES,
    audioOnly,
    audioFormat,
  });
  if (!result || !result.ok) return { ok: false, code: result?.ok === false ? result.code : 'unknown' };
  const filename = buildDownloadFilename({ ...item, ext: result.ext }, 0, currentSettings, sourcePage?.url);
  const downloadId = await platform.downloader.download(
    { url: result.blobUrl, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
  );
  const saved = downloadId !== undefined;
  if (downloadId !== undefined) {
    void recordDownloads([{
      src: item.src,
      filename: filename.split('/').pop() ?? filename,
      kind: item.kind,
      type: result.ext ?? item.type,
      thumbnailSrc: item.thumbnailSrc ?? item.poster ?? item.src,
      sourcePageUrl: item.sourcePage?.url ?? sourcePage?.url ?? '',
      sourcePageTitle: item.sourcePage?.title ?? sourcePage?.title,
      time: Date.now(),
      downloadId,
    }]);
  }
  notifyBatchDone({ total: 1, succeeded: saved ? 1 : 0, failed: saved ? 0 : 1, skipped: 0 });
  return { ok: true, filename, saved, segmentCount: result.segmentCount, muxedAudio: result.muxedAudio };
}
