import {
  ChromeMessage,
  DownloadResponse,
  ResolveOriginalsResponse,
  CaptureStreamResponse,
} from '@/types';
import { filterImagesBySettings, filterExcluded } from '../shared/collection/filters';
import { buildDownloadFilename } from '../shared/collection/download-name';
import { textToBase64 } from '../shared/download/base64';
import { recordDownloads, removeEntry, clearHistory, restoreHistory, loadHistory, srcsStillOnDisk, DiskState } from '../shared/storage/history';
import { addFavourite, removeFavourite, clearFavourites, restoreFavourites } from '../shared/storage/favourites';
import { addExcluded, removeExcluded, clearExcluded, restoreExcluded } from '../shared/storage/excluded';
import { streamErrorMessage } from '../shared/download/stream/stream-error-message';
import {
  enqueueDownloads, pauseQueue, resumeQueue, cancelQueue, retryQueueItem, getQueueSnapshot,
  clearFinishedQueue, retryAllFailedQueue, openQueueItem,
} from './download/download-queue';
import type { HistoryDraft, QueueState } from '../shared/storage/download-queue';
import { currentSettings, excludedCache, settingsReady, excludedReady, writeSettingsPatch } from './state';
import { storeSniffedMedia, snifferByTab, resolveOriginalsBatch } from './sniffer-store';
import { captureStreamToFile, captureRunTabs } from './download/capture';

/** Response callback shape for the background message router. */
export type SendResponse = (
  response: DownloadResponse | ResolveOriginalsResponse | string[] | CaptureStreamResponse | QueueState,
) => void;

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
        const entries = eligible.map((image, index) => {
          const filename = buildDownloadFilename(image, index, currentSettings, sourcePage?.url);
          const history: HistoryDraft = {
            src: image.src,
            filename: filename.split('/').pop() ?? filename,
            kind: image.kind,
            type: image.type,
            thumbnailSrc: image.thumbnailSrc ?? image.poster ?? image.src,
            sourcePageUrl: sourcePage?.url ?? '',
            sourcePageTitle: sourcePage?.title,
          };
          return { url: image.src, filename, history };
        });
        const queued = await enqueueDownloads(entries);
        respond({
          status: 'success',
          message: queued === 0 ? 'No files to download.' : `Queued ${queued} download${queued === 1 ? '' : 's'}.`,
        });
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
      chrome.downloads.download(
        { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
        (downloadId) => {
          // Record the ORIGINAL src so a converted image gets the "already
          // downloaded" mark + dedup like a plain download (history was silently
          // skipped for the whole convert-on-download path).
          if (chrome.runtime.lastError || downloadId === undefined || !source) return;
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
  // writeSettingsPatch) so popup + bubble writes never clobber each other.
  SET_SETTINGS: (message) => {
    writeSettingsPatch(message.patch);
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
    const { runId, item, sourcePage } = message;
    // Track the originating tab under this run's id (unset for popup captures,
    // whose sender.tab is undefined) so a CAPTURE_PROGRESS broadcast is relayed
    // to it — and only it — even while other captures run concurrently.
    if (sender.tab?.id != null) captureRunTabs.set(runId, sender.tab.id);
    // Everything after this fire lives in the background + offscreen doc — no
    // dependency on the popup, so the download completes even if it closes.
    void settingsReady.then(async () => {
      try {
        const cap = await captureStreamToFile(item, sourcePage, runId);
        captureRunTabs.delete(runId);
        if (!cap.ok) {
          respond({ status: streamErrorMessage(cap.code) });
          return;
        }
        const audioNote = cap.muxedAudio ? ' (video + audio)' : '';
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
