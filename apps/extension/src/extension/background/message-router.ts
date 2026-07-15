import {
  ChromeMessage,
  DownloadResponse,
  ResolveOriginalsResponse,
  CaptureStreamResponse,
  SettingsData,
  ListVariantsResult,
} from '@mbd/core/types';
import { filterImagesBySettings, filterExcluded } from '@mbd/core/collection/filters';
import { buildDownloadFilename } from '@mbd/core/collection/download-name';
import { partitionByDownloaded, uniquifyBatchNames } from '@mbd/core/collection/download-dedupe';
import { downloadedOnDiskKeys } from '@/extension/background/download/downloaded-keys';
import { textToBase64 } from '@mbd/core/download/base64';
import { buildMediaSidecar, serializeSidecar } from '@mbd/core/download/metadata-sidecar';
import { recordDownloads, removeEntry, clearHistory, restoreHistory, loadHistory, srcsStillOnDisk, DiskState } from '@mbd/storage/history';
import { addFavourite, removeFavourite, clearFavourites, restoreFavourites } from '@mbd/storage/favourites';
import { addExcluded, removeExcluded, clearExcluded, restoreExcluded } from '@mbd/storage/excluded';
import { savePerHostSettings, clearPerHostSettings } from '@mbd/storage/per-host-settings';
import { clearScanMemoryForHost, saveScanMemoryForHost } from '@mbd/storage/per-host-scan-memory';
import { streamErrorMessage } from '@mbd/core/download/stream/stream-error-message';
import { isMasterPlaylist } from '@mbd/core/download/stream/hls';
import { variantsFromMaster, variantsFromMpd } from '@mbd/core/download/stream/variants';
import {
  enqueueDownloads, pauseQueue, resumeQueue, cancelQueue, retryQueueItem, getQueueSnapshot,
  clearFinishedQueue, retryAllFailedQueue, openQueueItem,
} from '@/extension/background/download/download-queue';
import { scheduleSidecar } from '@/extension/background/download/sidecar-writer';
import type { HistoryDraft, EnqueueEntry, QueueState } from '@mbd/storage/download-queue';
import { currentSettings, excludedCache, settingsReady, excludedReady, writeSettingsPatch } from '@/extension/background/state';
import { storeSniffedMedia, snifferByTab, resolveOriginalsBatch } from '@/extension/background/sniffer-store';
import { captureStreamToFile, captureRunTabs } from '@/extension/background/download/capture';

/** Response callback shape for the background message router. */
export type SendResponse = (
  response: DownloadResponse | ResolveOriginalsResponse | string[] | CaptureStreamResponse | QueueState | SettingsData | ListVariantsResult,
) => void;

/** Push the current settings to every tab's content script so the on-page bubble
 *  applies changes live. Safari content scripts don't fire storage.onChanged for
 *  sync writes, so this broadcast — not the storage event — is what drives them.
 *  Used for both local writes (SET_SETTINGS) and remotely-synced changes picked up
 *  by the background's storage.onChanged. */
export function broadcastSettings(settings: SettingsData): void {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id != null) {
        void chrome.tabs.sendMessage(t.id, { type: 'SETTINGS_CHANGED', settings }).catch(() => {
          /* tab has no content script / was closed */
        });
      }
    }
  });
}

/**
 * One handler per message `type`. A handler returns `true` to keep the
 * sendResponse channel open for an async reply, and nothing otherwise
 * (fire-and-forget / synchronous). Each handler receives its message already
 * narrowed to that type, so there are no per-branch casts. Message types not
 * listed here are handled elsewhere (content scripts) and fall through to no
 * response.
 */
/** The object-shaped ChromeMessages (those with a discriminating `type`); the
 *  union also carries bare-string messages (GET_IMAGES, …) handled elsewhere. */
type ObjectMessage = Extract<ChromeMessage, { type: string }>;

/** Popup status for a queued batch, including any skipped-as-duplicate count. */
function queuedSkipMessage(queued: number, skipped: number): string {
  if (queued === 0) return skipped > 0 ? `Nothing new — ${skipped} already saved.` : 'No files to download.';
  const s = queued === 1 ? '' : 's';
  const tail = skipped > 0 ? ` (${skipped} skipped — already saved)` : '';
  return `Queued ${queued} download${s}${tail}.`;
}

type MessageRouter = {
  [K in ObjectMessage['type']]?: (
    message: Extract<ObjectMessage, { type: K }>,
    sender: chrome.runtime.MessageSender,
    respond: SendResponse,
  ) => boolean | void;
};

export const messageRouter: MessageRouter = {
  // Passive sniffer feed from the x.com content script (per tab). Fire-and-forget.
  X_MEDIA_SEEN: (message, sender) => {
    if (sender.tab?.id != null) storeSniffedMedia(sender.tab.id, message.pairs);
  },

  DOWNLOAD_IMAGES: (message, _sender, respond) => {
    const { images, sourcePage } = message;
    // Wait for settings so the filter and the built filenames use the user's
    // real settings, not defaults, when this message woke the worker. The popup
    // bulk-download path hands items to the persistent queue (retry/resume/
    // concurrency + real per-file success tracking, #196) rather than firing
    // chrome.downloads directly; history is recorded on actual completion, not
    // on dispatch. The response reports how many were queued.
    void Promise.all([settingsReady, excludedReady]).then(async () => {
      try {
        // An explicit re-download (Favourites/History panel) bypasses the
        // collection filters — the user picked these exact items, so a later
        // size/blocklist change must not silently drop them (as the context-menu
        // single download already does). Grid downloads re-filter as before.
        const eligible = message.explicit
          ? images
          : filterExcluded(filterImagesBySettings(images, currentSettings), excludedCache);

        // Skip images already on disk (non-explicit downloads only, when enabled).
        // Explicit re-downloads (Favourites/History) are exactly what the user
        // asked for and must never be skipped.
        let skipped = 0;
        let toDownload = eligible;
        if (!message.explicit && currentSettings.skipDuplicateDownloads) {
          const onDiskKeys = await downloadedOnDiskKeys();
          const part = partitionByDownloaded(eligible, onDiskKeys);
          toDownload = part.keep;
          skipped = part.skipped.length;
        }

        // De-collide filenames within this batch so distinct images that derive
        // the same name save as image.png / image-2.png instead of Chrome's
        // " (2)". conflictAction:'uniquify' (in the queue) stays as the
        // cross-batch safety net.
        const paths = uniquifyBatchNames(
          toDownload.map((image, index) => buildDownloadFilename(image, index, currentSettings, sourcePage?.url)),
        );
        // #284: attach a serialized <name>.json provenance sidecar to each queue
        // entry when enabled. The dispatcher writes it beside the file under its
        // ACTUAL on-disk name on completion (see sidecar-writer), so it can't
        // diverge from a media file Chrome uniquified (I6).
        const capturedAt = new Date().toISOString();
        const entries: EnqueueEntry[] = toDownload.map((image, i) => {
          const filename = paths[i];
          const history: HistoryDraft = {
            src: image.src,
            filename: filename.split('/').pop() ?? filename,
            kind: image.kind,
            type: image.type,
            thumbnailSrc: image.thumbnailSrc ?? image.poster ?? image.src,
            // Per-item source for multi-tab batches (#283); batch default otherwise.
            sourcePageUrl: image.sourcePage?.url ?? sourcePage?.url ?? '',
            sourcePageTitle: image.sourcePage?.title ?? sourcePage?.title,
          };
          const entry: EnqueueEntry = { url: image.src, filename, history };
          // Prefer the item's own source page (multi-tab batches, #283) so the
          // sidecar's provenance matches the history row + download folder above —
          // otherwise a tab-B image gets a sidecar naming the active tab A.
          if (currentSettings.metadataSidecar) entry.sidecar = serializeSidecar(buildMediaSidecar(image, image.sourcePage ?? sourcePage, capturedAt));
          return entry;
        });
        const queued = await enqueueDownloads(entries);
        respond({ status: 'success', message: queuedSkipMessage(queued, skipped) });
      } catch (e) {
        // Without this the port stays open and the popup hangs on "Sending…"
        // forever if the queue write (a storage.local set near quota) rejects.
        respond({ status: 'error', message: `Queue failed: ${e instanceof Error ? e.message : 'unknown error'}` });
      }
    });
    return true; // response is sent asynchronously after the items are enqueued
  },
  QUEUE_PAUSE: (_message, _sender, respond) => {
    void pauseQueue().then(() => respond({ status: 'success', message: 'Paused' }));
    return true;
  },
  QUEUE_RESUME: (_message, _sender, respond) => {
    void resumeQueue().then(() => respond({ status: 'success', message: 'Resumed' }));
    return true;
  },
  QUEUE_CANCEL: (message, _sender, respond) => {
    void cancelQueue(message.id ?? 'all').then(() => respond({ status: 'success', message: 'Cancelled' }));
    return true;
  },
  QUEUE_RETRY: (message, _sender, respond) => {
    const p = message.id === 'all-failed' ? retryAllFailedQueue() : retryQueueItem(message.id, message.referer);
    void p.then(() => respond({ status: 'success', message: 'Retrying' }));
    return true;
  },
  QUEUE_GET: (_message, _sender, respond) => {
    void getQueueSnapshot().then((snap) => respond(snap));
    return true;
  },
  QUEUE_CLEAR: (_message, _sender, respond) => {
    void clearFinishedQueue().then(() => respond({ status: 'success', message: 'Cleared' }));
    return true;
  },
  QUEUE_OPEN: (message, _sender, respond) => {
    void openQueueItem(message.id).then(() => respond({ status: 'success', message: 'Opened' }));
    return true;
  },

  DOWNLOAD_ZIP: (message, _sender, respond) => {
    const { b64, filename } = message;
    // Wait for settings so `saveAs` reflects the user's real preference even
    // when this message woke the worker. Service workers have no
    // URL.createObjectURL, so a base64 data URL is the only in-SW way to give
    // chrome.downloads the archive bytes; the popup base64-encodes them (a string
    // survives message serialization; a Uint8Array would not).
    void settingsReady.then(() => {
      const url = `data:application/zip;base64,${b64}`;
      chrome.downloads.download(
        { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
        (downloadId) => {
          const err = chrome.runtime.lastError;
          if (err || downloadId === undefined) {
            respond({ status: 'error', message: `Couldn't save ${filename}.` });
          } else {
            respond({ status: 'success', message: `Saved ${filename}.` });
          }
        },
      );
    });
    return true; // response sent asynchronously after the download dispatches
  },

  DOWNLOAD_TEXT: (message) => {
    const { filename, text, mime } = message;
    // Same rationale as DOWNLOAD_ZIP: the SW has no URL.createObjectURL, so a
    // base64 data URL is how text (a URL list / JSON backup) reaches downloads.
    void settingsReady.then(() => {
      const url = `data:${mime};base64,${textToBase64(text)}`;
      chrome.downloads.download(
        { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
        () => void chrome.runtime.lastError,
      );
    });
  },

  DOWNLOAD_BYTES: (message) => {
    const { filename, b64, mime, source } = message;
    void settingsReady.then(() => {
      const url = `data:${mime};base64,${b64}`;
      // #284: provenance sidecar for the converted file. The source carries the
      // original alt/dimensions + output ext, so the .json's `format` matches the
      // saved file. Built here; WRITTEN by sidecar-writer once the media download
      // completes, named from its ACTUAL on-disk name so it can't diverge (I6).
      const sidecarJson = currentSettings.metadataSidecar && source
        ? serializeSidecar(buildMediaSidecar(
            { src: source.src, alt: source.alt ?? '', width: source.width ?? 0, height: source.height ?? 0, type: source.type, kind: source.kind, ext: source.ext, fileSize: source.fileSize },
            { url: source.sourcePageUrl, title: source.sourcePageTitle },
            new Date().toISOString(),
          ))
        : undefined;
      chrome.downloads.download(
        { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
        (downloadId) => {
          if (chrome.runtime.lastError || downloadId === undefined) return;
          if (sidecarJson) scheduleSidecar(downloadId, filename, sidecarJson);
          // Record the ORIGINAL src so a converted image gets the "already
          // downloaded" mark + dedup like a plain download (history was silently
          // skipped for the whole convert-on-download path).
          if (!source) return;
          void recordDownloads([{
            src: source.src,
            filename: filename.split('/').pop() ?? filename,
            kind: source.kind,
            type: source.type,
            thumbnailSrc: source.thumbnailSrc ?? source.src,
            sourcePageUrl: source.sourcePageUrl,
            sourcePageTitle: source.sourcePageTitle,
            time: Date.now(),
            downloadId,
          }]);
        },
      );
    });
  },

  // Persist a settings patch through the single serialized writer (see
  // writeSettingsPatch) so popup + bubble writes never clobber each other, then
  // push the merged result to every tab's content script (SETTINGS_CHANGED) so
  // the on-page bubble applies live. Safari content scripts don't fire
  // storage.onChanged for sync writes, so this broadcast — not the storage event
  // — is what drives them (Chrome/Firefox get it the same way, uniformly).
  SET_SETTINGS: (message) => {
    void writeSettingsPatch(message.patch).then((settings) => broadcastSettings(settings));
  },

  // A content script's initial settings read. Content scripts can't reliably read
  // chrome.storage.sync on Safari, so the bubble asks the background (the settings
  // owner) instead. Await the gate so a cold worker never answers DEFAULT_SETTINGS.
  GET_SETTINGS: (_message, _sender, respond) => {
    void settingsReady.then(() => respond(currentSettings));
    return true; // response sent asynchronously
  },

  // Persist or clear a per-host settings override (#293). A separate key in a
  // separate storage area from global 'settings', so this can never clobber a
  // concurrent global write; the store's own serialized chain orders per-host writes.
  SET_PER_HOST_SETTINGS: (message) => {
    if (message.patch === null) {
      void clearPerHostSettings(message.host);
      void clearScanMemoryForHost(message.host); // also drop learned scan memory (#293 phase-2)
    } else void savePerHostSettings(message.host, message.patch);
  },

  // Persist a host's learned deep-scan memory. Routed here (not written directly in
  // the content script) so save + clear share the background's single serialized
  // writer and can't clobber each other across tabs/contexts (#293 phase-2).
  SAVE_SCAN_MEMORY: (message) => {
    void saveScanMemoryForHost(message.host, message.sample);
  },

  // Replace favourites + history + excluded from an imported backup, in the single-writer realm.
  RESTORE_DATA: (message) => {
    void restoreFavourites(message.favourites);
    void restoreHistory(message.history);
    void restoreExcluded(message.excluded);
  },

  // Content scripts (the bubble) can't call chrome.downloads; routing both popup
  // and bubble through here keeps one code path. open() takes no callback, so a
  // stale/removed id surfaces only as an async runtime.lastError, not a throw.
  OPEN_DOWNLOAD_FILE: (message) => {
    chrome.downloads.open(message.downloadId);
  },

  SHOW_DOWNLOAD: (message) => {
    chrome.downloads.show(message.downloadId);
  },

  // On-disk truth for the "already downloaded" tile mark. Only the background
  // realm can call chrome.downloads, so the popup and bubble both ask here. One
  // search over the download records, indexed by id — cheaper than one lookup per
  // history entry — then the pure filter decides what's still present.
  GET_DOWNLOADED_SRCS: (_message, _sender, respond) => {
    void (async () => {
      try {
        const history = await loadHistory();
        // limit:0 = no row cap. The default (1000, most-recent browser-wide) would
        // drop a heavy downloader's older extension entries out of the window, so
        // srcsStillOnDisk would treat those still-on-disk files as deleted and
        // re-offer them for download.
        const items = await chrome.downloads.search({ limit: 0 });
        const existsById = new Map(items.map((it) => [it.id, it.exists]));
        const stateById = (id: number): DiskState =>
          existsById.has(id) ? (existsById.get(id) ? 'exists' : 'deleted') : 'unknown';
        respond(srcsStillOnDisk(history, stateById));
      } catch {
        // Degrade to "nothing known downloaded" rather than leave the port open.
        respond([]);
      }
    })();
    return true; // response is sent asynchronously
  },

  // The URL is page-derived (a media/source URL from history); only ever open
  // real web pages, never javascript:/data:/file: schemes.
  OPEN_URL: (message) => {
    if (/^https?:\/\//i.test(message.url)) void chrome.tabs.create({ url: message.url });
  },

  // History + favourite + excluded mutations are routed here so every write
  // (downloads + user edits) happens in the background realm and serializes
  // through one write chain.
  CLEAR_HISTORY: () => { void clearHistory(); },
  REMOVE_HISTORY_ENTRY: (message) => { void removeEntry(message.src); },
  ADD_FAVOURITE: (message) => { void addFavourite(message.entry); },
  REMOVE_FAVOURITE: (message) => { void removeFavourite(message.src); },
  CLEAR_FAVOURITES: () => { void clearFavourites(); },
  ADD_EXCLUDED: (message) => { void addExcluded(message.entry); },
  REMOVE_EXCLUDED: (message) => { void removeExcluded(message.kind, message.value); },
  CLEAR_EXCLUDED: () => { void clearExcluded(); },

  RESOLVE_ORIGINALS: (message, sender, respond) => {
    // Dedup hints by src before resolving.
    const seen = new Set<string>();
    const hints = message.hints.filter((h) => {
      if (seen.has(h.src)) return false;
      seen.add(h.src);
      return true;
    });
    // Resolve against the source tab's sniffed mp4 map first. The tab is the
    // message sender (bubble/content); for a popup request there is no sender
    // tab, so fall back to the active tab.
    const run = (tabId?: number) => {
      const sniffed = tabId != null ? snifferByTab.get(tabId) : undefined;
      resolveOriginalsBatch(hints, undefined, sniffed).then((resolved) => respond({ resolved }));
    };
    if (sender.tab?.id != null) run(sender.tab.id);
    else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => run(tabs[0]?.id));
    return true; // async
  },

  CAPTURE_STREAM: (message, sender, respond) => {
    const { runId, item, sourcePage, audioOnly, audioFormat } = message;
    // Track the originating tab under this run's id (unset for popup captures,
    // whose sender.tab is undefined) so a CAPTURE_PROGRESS broadcast is relayed
    // to it — and only it — even while other captures run concurrently.
    if (sender.tab?.id != null) captureRunTabs.set(runId, sender.tab.id);
    // Everything after this fire lives in the background + offscreen doc — no
    // dependency on the popup, so the download completes even if it closes.
    void settingsReady.then(async () => {
      try {
        const cap = await captureStreamToFile(item, sourcePage, runId, audioOnly, audioFormat);
        captureRunTabs.delete(runId);
        if (!cap.ok) {
          // Refused/undownloadable — surface the code so the popup can offer the
          // "Copy download command" handoff (#285) instead of a dead end.
          respond({ status: streamErrorMessage(cap.code), refusal: { code: cap.code } });
          return;
        }
        const audioNote = audioOnly ? ' (audio only)' : cap.muxedAudio ? ' (video + audio)' : '';
        respond({
          status: cap.saved
            ? `Captured ${cap.filename} — ${cap.segmentCount} segments${audioNote}.`
            : `Couldn’t save ${cap.filename}.`,
        });
      } catch {
        captureRunTabs.delete(runId);
        respond({ status: 'Couldn’t capture the stream.' });
      }
    });
    return true; // response sent asynchronously
  },

  // Fetch + parse a stream's master manifest so the popup can offer a per-stream
  // rendition picker (#314). The SW holds <all_urls>, so this fetch is cross-origin
  // and CORS-free. Failure is non-fatal to capture — the popup falls back to Auto.
  LIST_VARIANTS: (message, _sender, respond) => {
    const { manifestUrl, engine } = message;
    void (async () => {
      try {
        const text = await (await fetch(manifestUrl)).text();
        const variants = engine === 'dash'
          ? variantsFromMpd(text, manifestUrl)
          : isMasterPlaylist(text) ? variantsFromMaster(text, manifestUrl) : [];
        respond({ ok: true, variants });
      } catch {
        respond({ ok: false, code: 'variant_list_failed' });
      }
    })();
    return true; // response sent asynchronously
  },

  // The offscreen doc broadcasts progress via runtime.sendMessage, which does not
  // reach content-script contexts. Relay it to the capture's originating tab
  // (looked up by runId) so that tab's bubble progress listener receives it — the
  // popup, an extension page, already gets the broadcast directly and filters by
  // runId. A runId with no mapped tab (a popup capture) relays nowhere.
  CAPTURE_PROGRESS: (message) => {
    const tabId = captureRunTabs.get(message.runId);
    if (tabId != null) {
      void chrome.tabs.sendMessage(tabId, message).catch(() => {
        /* tab closed / no receiver */
      });
    }
  },
};
