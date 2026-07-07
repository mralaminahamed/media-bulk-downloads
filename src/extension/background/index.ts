import {
  AddExcludedMessage,
  AddFavouriteMessage,
  ChromeMessage,
  DownloadMessage,
  DownloadResponse,
  DownloadZipMessage,
  DownloadTextMessage,
  DownloadBytesMessage,
  RestoreDataMessage,
  FavouriteEntry,
  HistoryEntry,
  ImageInfo,
  OpenDownloadMessage,
  OpenUrlMessage,
  RemoveExcludedMessage,
  RemoveFavouriteMessage,
  RemoveHistoryMessage,
  ResolveHint,
  ResolvedMedia,
  ResolveOriginalsMessage,
  ResolveOriginalsResponse,
  SettingsData,
  ShowDownloadMessage,
  XMediaSeenMessage,
  CaptureRunResult,
  CaptureStreamMessage,
  CaptureStreamResponse,
} from '@/types';
import { filterImagesBySettings, filterExcluded, ExcludedMatchers } from '../shared/collection/filters';
import { DEFAULT_SETTINGS, withDefaults } from '../shared/storage/settings';
import { sanitizePathSegment } from '../shared/collection/paths';
import {
  buildDownloadFilename,
  extensionForType,
  originalNameFromUrl,
} from '../shared/collection/download-name';
import { u8ToBase64, textToBase64 } from '../shared/download/base64';
import { upgradeToOriginal, detectType } from '../shared/collection/imageUrl';
import { extensionFromUrl } from '../shared/collection/mediaType';
import { resolveOriginal, NetDeps } from '../shared/resolvers/network';
import { mediaIdFromPoster, pinTwimgUrl } from '../shared/resolvers/sniffers/x-media-sniff';
import { recordDownloads, removeEntry, clearHistory, restoreHistory, loadHistory, srcsStillOnDisk } from '../shared/storage/history';
import { addFavourite, removeFavourite, clearFavourites, restoreFavourites } from '../shared/storage/favourites';
import { addExcluded, removeExcluded, clearExcluded, restoreExcluded, excludedMatchers, EXCLUDED_KEY } from '../shared/storage/excluded';
import { HLS_MAX_BYTES, HLS_TARGET_HEIGHT } from '../shared/download/capture-constants';
import { streamErrorMessage } from '../shared/download/stream-error-message';

// Re-exported for the background test suite, which imports them from here.
export { DEFAULT_SETTINGS, sanitizePathSegment, buildDownloadFilename, extensionForType, originalNameFromUrl };

let currentSettings: SettingsData = { ...DEFAULT_SETTINGS };

/** Live cache of the blocklist match sets, kept fresh via chrome.storage.onChanged
 *  so the badge count (a synchronous filter) never has to await storage. */
let excludedCache: ExcludedMatchers = { urls: new Set(), hosts: new Set() };
function reloadExcluded(): void {
  void excludedMatchers().then((m) => { excludedCache = m; });
}
reloadExcluded();

const BADGE_COLOR = '#4F46E5';

/**
 * Tab id the in-flight capture originated from, so CAPTURE_PROGRESS broadcasts
 * from the offscreen doc (which content scripts never receive via
 * runtime.sendMessage) can be relayed to that tab's bubble. Unset for popup
 * captures (sender.tab is undefined there) and cleared once the capture ends.
 */
let activeCaptureTabId: number | undefined;

// The service worker is ephemeral: a message can wake it and be handled before
// the async settings read completes. `settingsReady` resolves once settings have
// been read at least once, so a download that wakes the worker never runs against
// DEFAULT_SETTINGS (wrong subfolder/prefix/naming/filters).
let markSettingsLoaded: (() => void) | undefined;
const settingsReady: Promise<void> = new Promise((resolve) => {
  markSettingsLoaded = resolve;
});

/**
 * Load the current settings from storage.
 */
function loadSettings(): void {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      currentSettings = withDefaults(result.settings);
      applySettings();
    }
    // Resolve on the first read whether or not anything was stored — a first-run
    // user with no saved settings correctly keeps DEFAULT_SETTINGS.
    markSettingsLoaded?.();
    markSettingsLoaded = undefined;
  });
}

/**
 * Apply the current settings to all tabs.
 */
function applySettings(): void {
  if (!currentSettings.showImageCount) {
    clearAllBadges();
  } else {
    updateAllTabsBadges();
  }
  updateAllTabsActionMode();
}

/**
 * Whether the on-page bubble can be injected into a given URL. Content scripts
 * don't run on browser pages, the extension gallery, or the Chrome Web Store.
 */
export function isInjectableUrl(url: string | undefined): boolean {
  if (!url || !/^(https?|file):/i.test(url)) return false;
  if (/^https:\/\/chromewebstore\.google\.com/i.test(url)) return false;
  if (/^https:\/\/chrome\.google\.com\/webstore/i.test(url)) return false;
  if (/^https:\/\/addons\.mozilla\.org/i.test(url)) return false;
  return true;
}

/**
 * When the bubble is enabled on an injectable page, clear the toolbar popup so a
 * click toggles the on-page bubble instead. Everywhere else, keep the popup as a
 * fallback (it's the only surface that works on restricted pages).
 */
function updateTabActionMode(tabId: number, url: string | undefined): void {
  const useBubble = currentSettings.bubbleEnabled && isInjectableUrl(url);
  // WXT emits the popup as popup.html; restoring the toolbar popup must point at
  // that file (the old crxjs build used index.html).
  chrome.action.setPopup({ tabId, popup: useBubble ? '' : 'popup.html' });
}

function updateAllTabsActionMode(): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        updateTabActionMode(tab.id, tab.url);
      }
    });
  });
}

/**
 * Clear the badge text for all tabs.
 */
function clearAllBadges(): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    });
  });
}

/**
 * Update the badge text for all tabs.
 */
function updateAllTabsBadges(): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        updateTabBadge(tab.id);
      }
    });
  });
}

/**
 * Update the badge text for the given tab.
 */
function updateTabBadge(tabId: number): void {
  chrome.tabs.sendMessage(tabId, 'GET_IMAGES', (images: ImageInfo[]) => {
    // Tabs without a content script (chrome://, the web store, etc.) surface a
    // lastError; ignore them.
    if (chrome.runtime.lastError) {
      return;
    }

    if (images) {
      const eligible = filterExcluded(filterImagesBySettings(images, currentSettings), excludedCache);
      const badgeText = eligible.length.toString();
      chrome.action.setBadgeText({ text: badgeText, tabId });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
    }
  });
}

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

/**
 * Capture one HLS/DASH stream item to a downloaded file: run the offscreen
 * engine, then hand the muxed BLOB (never the manifest URL) to chrome.downloads.
 * Shared by the popup's CAPTURE_STREAM handler and the bulk "Download all" path,
 * so neither ever saves the raw manifest text. Returns a status descriptor.
 */
async function captureStreamToFile(
  item: ImageInfo,
  sourcePage: { url: string; title?: string } | undefined,
): Promise<
  | { ok: true; filename: string; saved: boolean; segmentCount: number; muxedAudio: boolean }
  | { ok: false; code: string }
> {
  await ensureOffscreen();
  const result = (await chrome.runtime.sendMessage({
    type: 'CAPTURE_RUN',
    manifestUrl: item.hlsManifest,
    engine: item.type === 'mpd' ? 'dash' : 'hls',
    quality: HLS_TARGET_HEIGHT,
    maxBytes: HLS_MAX_BYTES,
  })) as CaptureRunResult | undefined;
  if (!result || !result.ok) return { ok: false, code: result?.ok === false ? result.code : 'unknown' };
  const filename = buildDownloadFilename({ ...item, ext: result.ext }, 0, currentSettings, sourcePage?.url);
  const saved = await new Promise<boolean>((resolve) =>
    chrome.downloads.download(
      { url: result.blobUrl, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
      (id) => resolve(!chrome.runtime.lastError && id !== undefined),
    ),
  );
  return { ok: true, filename, saved, segmentCount: result.segmentCount, muxedAudio: result.muxedAudio };
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

/**
 * Real mp4/HLS media the page's own GraphQL responses exposed, per tab
 * (`mediaId -> ResolvedMedia`). Filled passively by the MAIN-world sniffer (see
 * `x-media-sniffer.content.ts`), consumed sniffer-first when resolving Twitter
 * videos so age-restricted clips the user can see resolve without any forged
 * request. In-memory, bounded, dropped when the tab closes.
 */
const snifferByTab = new Map<number, Map<string, ResolvedMedia>>();
const SNIFF_CAP_PER_TAB = 800;

/** Merge sniffed `[mediaId, ResolvedMedia]` pairs for a tab; the content script is
 *  untrusted, so this RE-PINS the sniffed `.url` (the real trust boundary) and
 *  caps defensively. */
export function storeSniffedMedia(tabId: number, pairs: unknown): void {
  if (!Array.isArray(pairs)) return;
  let map = snifferByTab.get(tabId);
  if (!map) {
    map = new Map();
    snifferByTab.set(tabId, map);
  }
  for (const pair of pairs) {
    if (!Array.isArray(pair)) continue;
    const [mid, media] = pair;
    if (typeof mid !== 'string' || !media || typeof media !== 'object') continue;
    const pinned = pinTwimgUrl((media as ResolvedMedia).url);
    if (!pinned) continue;
    const value: ResolvedMedia = (media as ResolvedMedia).hls ? { url: pinned, hls: true } : { url: pinned };
    // Always record: updating an existing id with a better variant must not be
    // blocked by the cap, and a new id past the cap evicts the OLDEST entry
    // (Map keeps insertion order) so a long session keeps its most recent clips
    // rather than freezing on the first 800 seen.
    if (!map.has(mid) && map.size >= SNIFF_CAP_PER_TAB) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(mid, value);
  }
}

/**
 * Resolves each hint to its final URL with bounded concurrency (limit 4).
 * Inline loop — the background service worker can't import the popup's
 * `mapWithConcurrency` helper. Failures are skipped (never throw).
 *
 * For Twitter videos, a real mp4 the page already exposed (`sniffed`, keyed by
 * the poster's media id) wins over a network fetch — it covers age-restricted
 * clips syndication tombstones and avoids a request entirely.
 */
export async function resolveOriginalsBatch(
  hints: { src: string; hint: ResolveHint }[],
  deps: NetDeps = { fetch: (...a) => fetch(...a) },
  sniffed?: Map<string, ResolvedMedia>,
): Promise<Record<string, ResolvedMedia>> {
  const out: Record<string, ResolvedMedia> = {};
  const limit = 4;
  let i = 0;
  async function worker() {
    while (i < hints.length) {
      const { src, hint } = hints[i++];
      let sniffedMedia: ResolvedMedia | undefined;
      if (hint.platform === 'twitter' && sniffed) {
        const mid = mediaIdFromPoster(src);
        if (mid) sniffedMedia = sniffed.get(mid);
      }
      if (sniffedMedia) { out[src] = sniffedMedia; continue; }
      const res = await resolveOriginal(hint, deps);
      if (res) out[src] = res;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, hints.length) }, worker));
  return out;
}

// ── Right-click context menu ─────────────────────────────────────────────────
const MENU = {
  downloadAll: 'mbd-download-all',
  downloadImage: 'mbd-download-image',
  favouriteImage: 'mbd-favourite-image',
  downloadMedia: 'mbd-download-media',
} as const;

/**
 * (Re)create the context menu items. removeAll-then-create is idempotent, so
 * this is safe to run on both install and startup without duplicate-id errors.
 */
export function setupContextMenus(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create({ id: MENU.downloadAll, title: 'Download all media on this page', contexts: ['all'] });
    chrome.contextMenus.create({ id: MENU.downloadImage, title: 'Download image (original quality)', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.favouriteImage, title: 'Add image to Favourites', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.downloadMedia, title: 'Download this media', contexts: ['video', 'audio'] });
    void chrome.runtime.lastError; // ignore a benign duplicate-id if menus already exist
  });
}

/**
 * Build an ImageInfo for a right-clicked media element. Images are upgraded to
 * their original via the CDN rules; video/audio are taken as-is. Only real
 * http(s) media is downloadable here — data:/blob: srcs are skipped.
 */
export function mediaFromContext(info: chrome.contextMenus.OnClickData): ImageInfo | null {
  const url = info.srcUrl;
  if (!url || !/^https?:/i.test(url)) return null;
  const kind: ImageInfo['kind'] = info.mediaType === 'video' ? 'video' : info.mediaType === 'audio' ? 'audio' : 'image';
  if (kind === 'image') {
    const { original } = upgradeToOriginal(url);
    return { src: original, alt: '', width: 0, height: 0, type: detectType(original), fileSize: 0, isBase64: false, kind };
  }
  return { src: url, alt: '', width: 0, height: 0, type: extensionFromUrl(url) ?? '', fileSize: 0, isBase64: false, kind };
}

/**
 * Collect the given tab's media (via its content script) and download the set
 * eligible under the user's settings. Shared by the "Download all" context-menu
 * item and the keyboard command. A non-injectable page (chrome://, the web
 * store) has no content script → the GET_IMAGES call lastErrors and is skipped.
 */
export function downloadAllForTab(tab?: chrome.tabs.Tab): void {
  if (tab?.id == null) return; // narrows `tab` to defined + `tab.id` to a number
  const sourcePage = tab.url ? { url: tab.url, title: tab.title } : undefined;
  chrome.tabs.sendMessage(tab.id, 'GET_IMAGES', (images: ImageInfo[]) => {
    if (chrome.runtime.lastError || !Array.isArray(images)) return;
    void settingsReady.then(() => {
      const eligible = filterExcluded(filterImagesBySettings(images, currentSettings), excludedCache);
      // HLS/DASH streams must be CAPTURED (fetch + mux segments), never handed to
      // chrome.downloads as a manifest URL — that saves the raw .m3u8/.mpd text as
      // a broken file. Split them out and capture each; download the rest normally.
      const streams = eligible.filter((i) => i.hlsManifest);
      const regular = eligible.filter((i) => !i.hlsManifest);
      if (regular.length) void downloadAndRecord(regular, sourcePage);
      for (const s of streams) void captureStreamToFile(s, sourcePage).catch(() => {});
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
    if (media) void settingsReady.then(() => downloadAndRecord([media], sourcePage));
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

chrome.contextMenus?.onClicked.addListener(onContextMenuClick);
chrome.commands?.onCommand.addListener(onCommand);
chrome.runtime.onStartup?.addListener(setupContextMenus);

chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
  setupContextMenus();
});

// Service workers are ephemeral; reload settings whenever the worker starts.
if (chrome.storage?.sync) {
  loadSettings();
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    currentSettings = withDefaults(changes.settings.newValue as Partial<SettingsData>);
    applySettings();
    // A change event also means settings are now known — resolve the gate so a
    // download isn't left waiting on the initial read.
    markSettingsLoaded?.();
    markSettingsLoaded = undefined;
  } else if (namespace === 'local' && changes[EXCLUDED_KEY]) {
    // The blocklist lives in storage.local (see excluded.ts). Refresh the live
    // matcher cache so the badge count reflects the change; the next natural
    // badge refresh (tab switch/reload) picks up the new cache.
    reloadExcluded();
  }
});

// Drop a tab's sniffed-media map when it closes (no persistence, no leak).
chrome.tabs.onRemoved.addListener((tabId) => {
  snifferByTab.delete(tabId);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (currentSettings.showImageCount) {
    updateTabBadge(activeInfo.tabId);
  }
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.id) return;
    updateTabActionMode(tab.id, tab.url);
  });
});

// When the bubble is enabled, the popup is cleared for injectable tabs, so a
// toolbar click lands here instead of opening the popup — toggle the bubble.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, 'TOGGLE_BUBBLE', () => void chrome.runtime.lastError);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateTabActionMode(tabId, tab.url);
  }

  if (!currentSettings.showImageCount) {
    return;
  }

  if (changeInfo.status === 'complete' && tab.url) {
    updateTabBadge(tabId);
  } else if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '...', tabId });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
  }
});

const OFFSCREEN_URL = 'offscreen.html';

/**
 * Ensure the single offscreen document exists (creating it on first capture and
 * reusing it after). Tolerates the concurrent-create race: two rapid captures can
 * both see no document, and the second createDocument throws — if a document now
 * exists, that is fine.
 */
async function ensureOffscreen(): Promise<void> {
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

chrome.runtime.onMessage.addListener(
  (
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: DownloadResponse | ResolveOriginalsResponse | string[] | CaptureStreamResponse) => void,
  ) => {
    if (typeof message === 'object' && message.type === 'X_MEDIA_SEEN') {
      // Passive sniffer feed from the x.com content script (per tab). Fire-and-forget.
      if (sender.tab?.id != null) storeSniffedMedia(sender.tab.id, (message as XMediaSeenMessage).pairs);
      return; // no response
    }

    if (typeof message === 'object' && message.type === 'DOWNLOAD_IMAGES') {
      const { images, sourcePage } = message as DownloadMessage;
      // Wait for settings so the filter and the built filenames use the user's
      // real settings, not defaults, when this message woke the worker. Report
      // the status only after the downloads are dispatched, so the popup shows
      // the real outcome (how many started / failed) rather than a premature,
      // never-updated "Downloading…".
      void settingsReady.then(async () => {
        const eligible = filterExcluded(filterImagesBySettings(images, currentSettings), excludedCache);
        const result = await downloadAndRecord(eligible, sourcePage);
        sendResponse({
          status: result.failed > 0 && result.succeeded === 0 ? 'error' : 'success',
          message: downloadStatusMessage(result),
        });
      });
      return true; // response is sent asynchronously after the downloads dispatch
    }

    if (typeof message === 'object' && message.type === 'DOWNLOAD_ZIP') {
      const { bytes, filename } = message as DownloadZipMessage;
      // Wait for settings so `saveAs` reflects the user's real preference even
      // when this message woke the worker. Service workers have no
      // URL.createObjectURL, so a base64 data URL is the only in-SW way to give
      // chrome.downloads the archive bytes.
      void settingsReady.then(() => {
        const url = `data:application/zip;base64,${u8ToBase64(bytes)}`;
        chrome.downloads.download(
          { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
          (downloadId) => {
            const err = chrome.runtime.lastError;
            if (err || downloadId === undefined) {
              sendResponse({ status: 'error', message: `Couldn't save ${filename}.` });
            } else {
              sendResponse({ status: 'success', message: `Saved ${filename}.` });
            }
          },
        );
      });
      return true; // response sent asynchronously after the download dispatches
    }

    if (typeof message === 'object' && message.type === 'DOWNLOAD_TEXT') {
      const { filename, text, mime } = message as DownloadTextMessage;
      // Same rationale as DOWNLOAD_ZIP: the SW has no URL.createObjectURL, so a
      // base64 data URL is how text (a URL list / JSON backup) reaches downloads.
      void settingsReady.then(() => {
        const url = `data:${mime};base64,${textToBase64(text)}`;
        chrome.downloads.download(
          { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
          () => void chrome.runtime.lastError,
        );
      });
      return; // fire-and-forget
    }

    if (typeof message === 'object' && message.type === 'DOWNLOAD_BYTES') {
      const { filename, bytes, mime } = message as DownloadBytesMessage;
      void settingsReady.then(() => {
        const url = `data:${mime};base64,${u8ToBase64(bytes)}`;
        chrome.downloads.download(
          { url, filename, saveAs: currentSettings.saveAs, conflictAction: 'uniquify' },
          () => void chrome.runtime.lastError,
        );
      });
      return; // fire-and-forget
    }

    if (typeof message === 'object' && message.type === 'RESTORE_DATA') {
      // Replace favourites + history + excluded from an imported backup, in the single-writer realm.
      const { favourites, history, excluded } = message as RestoreDataMessage;
      void restoreFavourites(favourites);
      void restoreHistory(history);
      void restoreExcluded(excluded);
      return; // fire-and-forget
    }

    if (typeof message === 'object' && message.type === 'OPEN_DOWNLOAD_FILE') {
      // Content scripts (the bubble) can't call chrome.downloads; routing both
      // popup and bubble through here keeps one code path. open() takes no
      // callback, so a stale/removed id surfaces only as an async
      // runtime.lastError (harmless console noise), not a throw.
      chrome.downloads.open((message as OpenDownloadMessage).downloadId);
      return; // fire-and-forget
    }

    if (typeof message === 'object' && message.type === 'SHOW_DOWNLOAD') {
      chrome.downloads.show((message as ShowDownloadMessage).downloadId);
      return;
    }

    if (typeof message === 'object' && message.type === 'GET_DOWNLOADED_SRCS') {
      // On-disk truth for the "already downloaded" tile mark. Only the background
      // realm can call chrome.downloads, so the popup and bubble both ask here.
      // One search over the download records, indexed by id — cheaper than one
      // lookup per history entry — then the pure filter decides what's still present.
      void (async () => {
        const history = await loadHistory();
        const items = await chrome.downloads.search({});
        const existsById = new Map(items.map((it) => [it.id, it.exists]));
        sendResponse(srcsStillOnDisk(history, (id) => existsById.get(id) === true));
      })();
      return true; // response is sent asynchronously
    }

    if (typeof message === 'object' && message.type === 'OPEN_URL') {
      // The URL is page-derived (a media/source URL from history); only ever open
      // real web pages, never javascript:/data:/file: schemes.
      const { url } = message as OpenUrlMessage;
      if (/^https?:\/\//i.test(url)) void chrome.tabs.create({ url });
      return;
    }

    // History mutations are routed here so every write (downloads + user edits)
    // happens in the background realm and serializes through one write chain.
    if (typeof message === 'object' && message.type === 'CLEAR_HISTORY') {
      void clearHistory();
      return;
    }

    if (typeof message === 'object' && message.type === 'REMOVE_HISTORY_ENTRY') {
      void removeEntry((message as RemoveHistoryMessage).src);
      return;
    }

    // Favourite mutations are routed here too — same single-writer rationale.
    if (typeof message === 'object' && message.type === 'ADD_FAVOURITE') {
      void addFavourite((message as AddFavouriteMessage).entry);
      return;
    }

    if (typeof message === 'object' && message.type === 'REMOVE_FAVOURITE') {
      void removeFavourite((message as RemoveFavouriteMessage).src);
      return;
    }

    if (typeof message === 'object' && message.type === 'CLEAR_FAVOURITES') {
      void clearFavourites();
      return;
    }

    // Excluded-sources (blocklist) mutations — same single-writer rationale.
    if (typeof message === 'object' && message.type === 'ADD_EXCLUDED') {
      void addExcluded((message as AddExcludedMessage).entry);
      return; // fire-and-forget
    }
    if (typeof message === 'object' && message.type === 'REMOVE_EXCLUDED') {
      const m = message as RemoveExcludedMessage;
      void removeExcluded(m.kind, m.value);
      return;
    }
    if (typeof message === 'object' && message.type === 'CLEAR_EXCLUDED') {
      void clearExcluded();
      return;
    }

    if (typeof message === 'object' && message.type === 'RESOLVE_ORIGINALS') {
      // Dedup hints by src before resolving.
      const seen = new Set<string>();
      const hints = (message as ResolveOriginalsMessage).hints.filter((h) => {
        if (seen.has(h.src)) return false;
        seen.add(h.src);
        return true;
      });
      // Resolve against the source tab's sniffed mp4 map first. The tab is the
      // message sender (bubble/content); for a popup request there is no sender
      // tab, so fall back to the active tab.
      const run = (tabId?: number) => {
        const sniffed = tabId != null ? snifferByTab.get(tabId) : undefined;
        resolveOriginalsBatch(hints, undefined, sniffed).then((resolved) => sendResponse({ resolved }));
      };
      if (sender.tab?.id != null) run(sender.tab.id);
      else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => run(tabs[0]?.id));
      return true; // async
    }

    if (typeof message === 'object' && message.type === 'CAPTURE_STREAM') {
      const { item, sourcePage } = message as CaptureStreamMessage;
      // Track the originating tab (unset for popup captures, whose sender.tab is
      // undefined) so a CAPTURE_PROGRESS broadcast can be relayed to it below.
      activeCaptureTabId = sender.tab?.id;
      // Everything after this fire lives in the background + offscreen doc — no
      // dependency on the popup, so the download completes even if it closes.
      void settingsReady.then(async () => {
        try {
          const cap = await captureStreamToFile(item, sourcePage);
          activeCaptureTabId = undefined;
          if (!cap.ok) {
            sendResponse({ status: streamErrorMessage(cap.code) });
            return;
          }
          const audioNote = cap.muxedAudio ? ' (video + audio)' : '';
          sendResponse({
            status: cap.saved
              ? `Captured ${cap.filename} — ${cap.segmentCount} segments${audioNote}.`
              : `Couldn’t save ${cap.filename}.`,
          });
        } catch {
          activeCaptureTabId = undefined;
          sendResponse({ status: 'Couldn’t capture the stream.' });
        }
      });
      return true; // response sent asynchronously
    }

    if (typeof message === 'object' && message.type === 'CAPTURE_PROGRESS') {
      // The offscreen doc broadcasts progress via runtime.sendMessage, which does
      // not reach content-script contexts. Relay it to the capturing tab so the
      // on-page bubble's progress listener receives it (the popup, an extension
      // page, already gets the broadcast directly). tabId is unset for popup
      // captures (sender.tab is undefined there), so nothing is forwarded then.
      if (activeCaptureTabId != null) {
        void chrome.tabs.sendMessage(activeCaptureTabId, message).catch(() => {
          /* tab closed / no receiver */
        });
      }
      return false; // not for this context to answer
    }

    // Unmatched messages (e.g. the content script's DEEP_SCAN_PROGRESS broadcast)
    // get no response — return false so the message channel closes immediately
    // instead of leaking an open port.
    return false;
  },
);

export { updateTabBadge, loadSettings };
