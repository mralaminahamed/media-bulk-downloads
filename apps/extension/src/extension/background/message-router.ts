import {
  ChromeMessage,
  DownloadResponse,
  ResolveOriginalsResponse,
  ProbeMediaMetaResponse,
  CaptureStreamResponse,
  SettingsData,
  ListVariantsResult,
  DownloadState,
} from '@mbd/core/types';
import { filterImagesBySettings, filterExcluded } from '@mbd/core/collection/filters';
import { textToBase64 } from '@mbd/core/download/base64';
import { buildMediaSidecar, serializeSidecar } from '@mbd/core/download/metadata-sidecar';
import { recordDownloads, removeEntry, clearHistory, restoreHistory, loadHistory, srcsStillOnDisk, diskState } from '@mbd/storage/history';
import { addFavourite, removeFavourite, clearFavourites, restoreFavourites } from '@mbd/storage/favourites';
import { addExcluded, removeExcluded, clearExcluded, restoreExcluded } from '@mbd/storage/excluded';
import { savePerHostSettings, clearPerHostSettings } from '@mbd/storage/per-host-settings';
import { clearScanMemoryForHost, saveScanMemoryForHost } from '@mbd/storage/per-host-scan-memory';
import { streamErrorMessage } from '@mbd/core/download/stream/stream-error-message';
import { isMasterPlaylist } from '@mbd/core/download/stream/hls';
import { variantsFromMaster, variantsFromMpd } from '@mbd/core/download/stream/variants';
import { assertSafeCaptureUrl } from '@mbd/core/download/stream/ssrf-guard';
import { probeMediaMetaBatch } from '@mbd/core/net/size-probe';
import { retryingFetch } from '@mbd/core/net/retry';
import { readBoundedText } from '@mbd/core/download/stream/bounded-fetch';
import {
  pauseQueue, resumeQueue, cancelQueue, retryQueueItem, getQueueSnapshot,
  clearFinishedQueue, retryAllFailedQueue, openQueueItem,
} from '@/extension/background/download/download-queue';
import { enqueueMedia } from '@/extension/background/download/enqueue-media';
import { scheduleSidecar } from '@/extension/background/download/sidecar-writer';
import { platform } from '@/extension/platform';
import type { QueueState } from '@mbd/storage/download-queue';
import { currentSettings, excludedCache, settingsReady, excludedReady, writeSettingsPatch } from '@/extension/background/state';
import { storeSniffedMedia, snifferByTab, resolveOriginalsBatch } from '@/extension/background/sniffer-store';
import { captureStreamToFile, captureRunTabs } from '@/extension/background/download/capture';

/** Response callback shape for the background message router. */
export type SendResponse = (
  response: DownloadResponse | ResolveOriginalsResponse | ProbeMediaMetaResponse | string[] | CaptureStreamResponse | QueueState | SettingsData | ListVariantsResult | DownloadState[],
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

/** Bounds on the explicit size/type probe: one request per item, so a huge
 *  gallery must not turn one click into a thousand parallel requests. */
const PROBE_CAP = 400;
const PROBE_CONCURRENCY = 6;
const PROBE_TIMEOUT_MS = 10_000;

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
  X_MEDIA_SEEN: (message, sender) => {
    if (sender.tab?.id != null) storeSniffedMedia(sender.tab.id, message.pairs);
  },

  DOWNLOAD_IMAGES: (message, _sender, respond) => {
    const { images, sourcePage } = message;
    void Promise.all([settingsReady, excludedReady]).then(async () => {
      try {
        const eligible = message.explicit
          ? images
          : filterExcluded(filterImagesBySettings(images, currentSettings), excludedCache);

        const { queued, skipped } = await enqueueMedia(eligible, sourcePage, {
          skipDuplicates: !message.explicit && currentSettings.skipDuplicateDownloads,
        });
        respond({ status: 'success', message: queuedSkipMessage(queued, skipped) });
      } catch (e) {
        respond({ status: 'error', message: `Queue failed: ${e instanceof Error ? e.message : 'unknown error'}` });
      }
    });
    return true;
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
    void settingsReady.then(async () => {
      const url = `data:application/zip;base64,${b64}`;
      const downloadId = await platform.downloader.download(
        { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
      );
      if (downloadId === undefined) {
        respond({ status: 'error', message: `Couldn't save ${filename}.` });
      } else {
        respond({ status: 'success', message: `Saved ${filename}.` });
      }
    });
    return true;
  },

  DOWNLOAD_TEXT: (message) => {
    const { filename, text, mime } = message;
    void settingsReady.then(() => {
      const url = `data:${mime};base64,${textToBase64(text)}`;
      void platform.downloader.download({ url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' });
    });
  },

  DOWNLOAD_BYTES: (message) => {
    const { filename, b64, mime, source } = message;
    void settingsReady.then(async () => {
      const url = `data:${mime};base64,${b64}`;
      const sidecarJson = currentSettings.metadataSidecar && source
        ? serializeSidecar(buildMediaSidecar(
            { src: source.src, alt: source.alt ?? '', width: source.width ?? 0, height: source.height ?? 0, type: source.type, kind: source.kind, ext: source.ext, fileSize: source.fileSize },
            { url: source.sourcePageUrl, title: source.sourcePageTitle },
            new Date().toISOString(),
          ))
        : undefined;
      const downloadId = await platform.downloader.download(
        { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
      );
      if (downloadId === undefined) return;
      if (sidecarJson) scheduleSidecar(downloadId, filename, sidecarJson);
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
    });
  },

  SET_SETTINGS: (message) => {
    void writeSettingsPatch(message.patch).then((settings) => broadcastSettings(settings));
  },

  GET_SETTINGS: (_message, _sender, respond) => {
    void settingsReady.then(() => respond(currentSettings));
    return true;
  },

  SET_PER_HOST_SETTINGS: (message) => {
    if (message.patch === null) {
      void clearPerHostSettings(message.host);
      void clearScanMemoryForHost(message.host);
    } else void savePerHostSettings(message.host, message.patch);
  },

  SAVE_SCAN_MEMORY: (message) => {
    void saveScanMemoryForHost(message.host, message.sample);
  },

  RESTORE_DATA: (message) => {
    void restoreFavourites(message.favourites);
    void restoreHistory(message.history);
    void restoreExcluded(message.excluded);
  },

  OPEN_DOWNLOAD_FILE: (message) => {
    platform.downloader.open(message.downloadId);
  },

  SHOW_DOWNLOAD: (message) => {
    platform.downloader.show(message.downloadId);
  },

  GET_DOWNLOADED_SRCS: (_message, _sender, respond) => {
    void (async () => {
      try {
        const history = await loadHistory();
        const items = await platform.downloader.search({ limit: 0 });
        const existsById = new Map(items.map((it) => [it.id, it.exists === true]));
        respond(srcsStillOnDisk(history, (id) => diskState(id, existsById)));
      } catch {
        respond([]);
      }
    })();
    return true;
  },

  GET_DOWNLOAD_STATES: (_message, _sender, respond) => {
    void (async () => {
      try {
        const items = await platform.downloader.search({ limit: 0 });
        respond(items.map((it) => ({ id: it.id, exists: it.exists !== false })));
      } catch {
        respond([]);
      }
    })();
    return true;
  },

  OPEN_URL: (message) => {
    if (/^https?:\/\//i.test(message.url)) void chrome.tabs.create({ url: message.url });
  },

  CLEAR_HISTORY: () => { void clearHistory(); },
  REMOVE_HISTORY_ENTRY: (message) => { void removeEntry(message.src); },
  ADD_FAVOURITE: (message) => { void addFavourite(message.entry); },
  REMOVE_FAVOURITE: (message) => { void removeFavourite(message.src); },
  CLEAR_FAVOURITES: () => { void clearFavourites(); },
  ADD_EXCLUDED: (message) => { void addExcluded(message.entry); },
  REMOVE_EXCLUDED: (message) => { void removeExcluded(message.kind, message.value); },
  CLEAR_EXCLUDED: () => { void clearExcluded(); },

  RESOLVE_ORIGINALS: (message, sender, respond) => {
    const seen = new Set<string>();
    const hints = message.hints.filter((h) => {
      if (seen.has(h.src)) return false;
      seen.add(h.src);
      return true;
    });
    const run = (tabId?: number) => {
      const sniffed = tabId != null ? snifferByTab.get(tabId) : undefined;
      void settingsReady.then(() => {
        const authed = message.authed === true && currentSettings.sankakuAuthedOriginals === true;
        resolveOriginalsBatch(hints, undefined, sniffed, authed).then((resolved) => respond({ resolved }));
      });
    };
    if (sender.tab?.id != null) run(sender.tab.id);
    else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => run(tabs[0]?.id));
    return true;
  },

  PROBE_MEDIA_META: (message, _sender, respond) => {
    const srcs = [...new Set(message.srcs)].slice(0, PROBE_CAP);
    void probeMediaMetaBatch(srcs, { fetch: retryingFetch(fetch, { maxAttempts: 2, timeoutMs: PROBE_TIMEOUT_MS }) }, PROBE_CONCURRENCY)
      .then((meta) => respond({ meta }))
      .catch(() => respond({ meta: {} }));
    return true;
  },

  CAPTURE_STREAM: (message, sender, respond) => {
    const { runId, item, sourcePage, audioOnly, audioFormat, quality } = message;
    if (sender.tab?.id != null) captureRunTabs.set(runId, sender.tab.id);
    void settingsReady.then(async () => {
      try {
        const cap = await captureStreamToFile(item, sourcePage, runId, audioOnly, audioFormat, quality);
        captureRunTabs.delete(runId);
        if (!cap.ok) {
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
    return true;
  },

  LIST_VARIANTS: (message, _sender, respond) => {
    const { manifestUrl, engine } = message;
    void (async () => {
      try {
        assertSafeCaptureUrl(manifestUrl);
        const text = await readBoundedText(await fetch(manifestUrl, { redirect: 'error' }));
        const variants = engine === 'dash'
          ? variantsFromMpd(text, manifestUrl)
          : isMasterPlaylist(text) ? variantsFromMaster(text, manifestUrl) : [];
        respond({ ok: true, variants });
      } catch {
        respond({ ok: false, code: 'variant_list_failed' });
      }
    })();
    return true;
  },

  CAPTURE_PROGRESS: (message) => {
    const tabId = captureRunTabs.get(message.runId);
    if (tabId != null) {
      void chrome.tabs.sendMessage(tabId, message).catch(() => {
        /* tab closed / no receiver */
      });
    }
  },
};
