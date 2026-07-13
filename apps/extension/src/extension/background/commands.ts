import { FavouriteEntry, ImageInfo } from '@mbd/core/types';
import { filterImagesBySettings, filterExcluded, isPendingOrStream } from '@mbd/core/collection/filters';
import { newCaptureRunId } from '../shared/active-tab/capture-stream-active';
import { addFavourite } from '@mbd/storage/favourites';
import { currentSettings, excludedCache, settingsReady, excludedReady } from './state';
import { downloadAndRecord } from './download/downloads';
import { captureStreamToFile, captureRunTabs } from './download/capture';
import { MENU, mediaFromContext } from './context-menu';

/**
 * Collect the given tab's media (via its content script) and download the set
 * eligible under the user's settings. Shared by the "Download all" context-menu
 * item and the keyboard command. A non-injectable page (chrome://, the web
 * store) has no content script → the GET_IMAGES call lastErrors and is skipped.
 */
export function downloadAllForTab(tab?: chrome.tabs.Tab): void {
  if (tab?.id == null) return; // narrows `tab` to defined + `tab.id` to a number
  const tabId = tab.id; // a const keeps the narrowing inside the nested callbacks below
  const sourcePage = tab.url ? { url: tab.url, title: tab.title } : undefined;
  chrome.tabs.sendMessage(tabId, 'GET_IMAGES', (images: ImageInfo[]) => {
    if (chrome.runtime.lastError || !Array.isArray(images)) return;
    void Promise.all([settingsReady, excludedReady]).then(() => {
      const eligible = filterExcluded(filterImagesBySettings(images, currentSettings), excludedCache);
      // HLS/DASH streams must be CAPTURED (fetch + mux segments), never handed to
      // chrome.downloads as a manifest URL — that saves the raw .m3u8/.mpd text as
      // a broken file. Split them out and capture each; download the rest normally.
      // Pending videos/images (unresolved — no real file behind `src` yet) are
      // neither streams nor downloadable: a pending image's `src` is the x.com
      // tweet-page URL, so handing it to chrome.downloads would fetch the HTML
      // page and save it as a bogus `.jpg`. Drop them from both buckets.
      const streams = eligible.filter((i) => i.hlsManifest);
      const regular = eligible.filter((i) => !isPendingOrStream(i));
      if (regular.length) void downloadAndRecord(regular, sourcePage, { skipDuplicates: currentSettings.skipDuplicateDownloads });
      for (const s of streams) {
        // Register the capturing tab under this run's id so its progress relays
        // to this tab's bubble (and no other concurrent capture's).
        const runId = newCaptureRunId();
        captureRunTabs.set(runId, tabId);
        void captureStreamToFile(s, sourcePage, runId)
          .catch(() => {})
          .finally(() => captureRunTabs.delete(runId));
      }
    });
  });
}

/** Keyboard-command dispatch. `_execute_action` (open popup) is handled by the
 *  browser itself and never reaches here. */
export function onCommand(command: string): void {
  if (command === 'download-all-media') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => downloadAllForTab(tabs[0]));
  }
}

export function onContextMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): void {
  const sourcePage = tab?.url ? { url: tab.url, title: tab.title } : undefined;

  if (info.menuItemId === MENU.downloadAll) {
    downloadAllForTab(tab);
    return;
  }

  if (info.menuItemId === MENU.downloadImage || info.menuItemId === MENU.downloadMedia) {
    const media = mediaFromContext(info);
    // A single explicit right-click download is NOT run through the size/base64
    // filters — the user picked this exact item.
    if (media) void settingsReady.then(() => downloadAndRecord([media], sourcePage, { skipDuplicates: false }));
    return;
  }

  if (info.menuItemId === MENU.favouriteImage) {
    const media = mediaFromContext(info);
    if (!media) return;
    const entry: FavouriteEntry = {
      src: media.src,
      kind: media.kind,
      type: media.type,
      thumbnailSrc: info.srcUrl,
      sourcePageUrl: tab?.url ?? '',
      sourcePageTitle: tab?.title,
      time: Date.now(),
    };
    void addFavourite(entry);
  }
}
