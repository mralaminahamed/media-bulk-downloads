import type { ImageInfo } from '@mbd/core/types';
import { buildDownloadFilename } from '@mbd/core/collection/download-name';
import { partitionByDownloaded, uniquifyBatchNames } from '@mbd/core/collection/download-dedupe';
import { buildMediaSidecar, serializeSidecar } from '@mbd/core/download/metadata-sidecar';
import type { EnqueueEntry, HistoryDraft } from '@mbd/storage/download-queue';
import { currentSettings } from '@/extension/background/state';
import { downloadedOnDiskKeys } from '@/extension/background/download/downloaded-keys';
import { enqueueDownloads } from '@/extension/background/download/download-queue';

/**
 * Turn collected media into download-queue entries — filename derivation,
 * already-on-disk skipping, the history draft and the optional metadata sidecar.
 *
 * Every download surface (popup, keyboard command, context menu) goes through
 * here and then through the queue, so all of them get the queue's real
 * terminal-state handling. The keyboard/context-menu path used to call
 * chrome.downloads directly and record a history entry the moment an id came
 * back — a download that started and then 403'd was written to history as a
 * success.
 */
export async function buildEnqueueEntries(
  eligible: ImageInfo[],
  sourcePage: { url: string; title?: string } | undefined,
  opts: { skipDuplicates?: boolean } = {},
): Promise<{ entries: EnqueueEntry[]; skipped: number }> {
  let toDownload = eligible;
  let skipped = 0;
  if (opts.skipDuplicates) {
    const part = partitionByDownloaded(eligible, await downloadedOnDiskKeys());
    toDownload = part.keep;
    skipped = part.skipped.length;
  }

  const paths = uniquifyBatchNames(
    toDownload.map((image, index) => buildDownloadFilename(image, index, currentSettings, sourcePage?.url)),
  );
  const capturedAt = new Date().toISOString();
  const entries = toDownload.map((image, i): EnqueueEntry => {
    const filename = paths[i];
    const history: HistoryDraft = {
      src: image.src,
      filename: filename.split('/').pop() ?? filename,
      kind: image.kind,
      type: image.type,
      thumbnailSrc: image.thumbnailSrc ?? image.poster ?? image.src,
      sourcePageUrl: image.sourcePage?.url ?? sourcePage?.url ?? '',
      sourcePageTitle: image.sourcePage?.title ?? sourcePage?.title,
    };
    if (image.expiresAt !== undefined) history.expiresAt = image.expiresAt;
    if (image.mediaKey) history.mediaKey = image.mediaKey;

    const entry: EnqueueEntry = { url: image.src, filename, history };
    if (image.expiresAt !== undefined) entry.expiresAt = image.expiresAt;
    if (currentSettings.metadataSidecar) {
      entry.sidecar = serializeSidecar(buildMediaSidecar(image, image.sourcePage ?? sourcePage, capturedAt));
    }
    return entry;
  });

  return { entries, skipped };
}

/** Build entries and hand them to the queue. Resolves once queued — NOT once
 *  downloaded; completion is reported by the queue's own drain notification. */
export async function enqueueMedia(
  eligible: ImageInfo[],
  sourcePage: { url: string; title?: string } | undefined,
  opts: { skipDuplicates?: boolean } = {},
): Promise<{ queued: number; skipped: number }> {
  const { entries, skipped } = await buildEnqueueEntries(eligible, sourcePage, opts);
  const queued = await enqueueDownloads(entries, skipped);
  return { queued, skipped };
}
