import {
  ChromeMessage,
  DownloadMessage,
  DownloadResponse,
  HistoryEntry,
  ImageInfo,
  OpenDownloadMessage,
  OpenUrlMessage,
  ResolveHint,
  ResolveOriginalsMessage,
  ResolveOriginalsResponse,
  SettingsData,
  ShowDownloadMessage,
} from '@/types';
import { filterImagesBySettings } from './shared/filters';
import { DEFAULT_SETTINGS, withDefaults } from './shared/settings';
import { sanitizePathSegment } from './shared/paths';
import { avExtensionForType, extensionFromUrl } from './shared/mediaType';
import { resolveOriginal, NetDeps } from './shared/resolvers/network';
import { recordDownloads } from './shared/history';

export { DEFAULT_SETTINGS, sanitizePathSegment };

let currentSettings: SettingsData = { ...DEFAULT_SETTINGS };

const BADGE_COLOR = '#4F46E5';

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
  chrome.action.setPopup({ tabId, popup: useBubble ? '' : 'index.html' });
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
      const badgeText = filterImagesBySettings(images, currentSettings).length.toString();
      chrome.action.setBadgeText({ text: badgeText, tabId });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
    }
  });
}

/**
 * Maps a collected image type to a safe file extension.
 */
export function extensionForType(type: string): string {
  switch (type) {
    case 'jpeg':
      return 'jpg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'avif':
    case 'bmp':
    case 'ico':
      return type;
    default:
      return 'jpg';
  }
}


/**
 * Derives a safe base filename (no extension) from an image URL, or null when the
 * URL carries no usable name — data/blob URIs, or paths with no basename
 * (trailing slash / query-only). The caller appends the detected extension.
 */
export function originalNameFromUrl(url: string): string | null {
  if (/^(data|blob):/i.test(url)) return null;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const last = pathname.split('/').pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /* keep raw on malformed escapes */
  }

  // Strip a trailing extension only when the dot isn't the first char.
  const dot = decoded.lastIndexOf('.');
  const base = dot > 0 ? decoded.slice(0, dot) : decoded;

  const safe = sanitizePathSegment(base).split('/').pop() ?? '';
  return safe || null;
}

/**
 * Builds a safe, relative download path for an image.
 */
export function buildDownloadFilename(
  image: ImageInfo,
  index: number,
  settings: SettingsData,
): string {
  const extension =
    image.kind === 'image'
      ? extensionForType(image.type)
      : (avExtensionForType(image.type)
          ?? extensionFromUrl(image.src)
          ?? (image.kind === 'video' ? 'mp4' : 'mp3'));
  const prefixed = `${sanitizePathSegment(settings.fileNamePrefix) || 'image_'}${index + 1}.${extension}`;

  let fileName: string;
  if (settings.namingMode === 'original') {
    const name = originalNameFromUrl(image.src);
    fileName = name ? `${name}.${extension}` : prefixed;
  } else {
    fileName = prefixed;
  }

  const dir = sanitizePathSegment(settings.downloadPath);
  return dir ? `${dir}/${fileName}` : fileName;
}

/**
 * Downloads each eligible image and records the successful ones to history,
 * tagged with the source page they came from. Failures (a Chrome-reported
 * `lastError`, or no `downloadId`) are silently skipped — nothing is recorded
 * for them.
 */
export async function downloadAndRecord(
  eligible: ImageInfo[],
  sourcePage: { url: string; title?: string } | undefined,
): Promise<void> {
  const entries = await Promise.all(
    eligible.map(
      (image, index) =>
        new Promise<HistoryEntry | null>((resolve) => {
          const filename = buildDownloadFilename(image, index, currentSettings);
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
  await recordDownloads(entries.filter((e): e is HistoryEntry => e !== null));
}

/**
 * Resolves each hint to its final URL with bounded concurrency (limit 4).
 * Inline loop — the background service worker can't import the popup's
 * `mapWithConcurrency` helper. Failures are skipped (never throw).
 */
export async function resolveOriginalsBatch(
  hints: { src: string; hint: ResolveHint }[],
  deps: NetDeps = { fetch: (...a) => fetch(...a) },
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const limit = 4;
  let i = 0;
  async function worker() {
    while (i < hints.length) {
      const { src, hint } = hints[i++];
      const url = await resolveOriginal(hint, deps);
      if (url) out[src] = url;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, hints.length) }, worker));
  return out;
}

chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
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
  }
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

chrome.runtime.onMessage.addListener(
  (
    message: ChromeMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: DownloadResponse | ResolveOriginalsResponse) => void,
  ) => {
    if (typeof message === 'object' && message.type === 'DOWNLOAD_IMAGES') {
      const { images, sourcePage } = message as DownloadMessage;
      // Wait for settings so the filter and the built filenames use the user's
      // real settings, not defaults, when this message woke the worker.
      void settingsReady.then(() => {
        const eligible = filterImagesBySettings(images, currentSettings);
        sendResponse({ status: 'success', message: `Downloading ${eligible.length} files...` });
        return downloadAndRecord(eligible, sourcePage);
      });
      return true; // response is sent asynchronously after settings load
    }

    if (typeof message === 'object' && message.type === 'OPEN_DOWNLOAD_FILE') {
      // Content scripts (the bubble) can't call chrome.downloads; the popup
      // could, but routing both through here keeps one code path. Guard against
      // a since-removed download so a stale id never throws.
      chrome.downloads.open((message as OpenDownloadMessage).downloadId);
      return; // fire-and-forget
    }

    if (typeof message === 'object' && message.type === 'SHOW_DOWNLOAD') {
      chrome.downloads.show((message as ShowDownloadMessage).downloadId);
      return;
    }

    if (typeof message === 'object' && message.type === 'OPEN_URL') {
      void chrome.tabs.create({ url: (message as OpenUrlMessage).url });
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
      resolveOriginalsBatch(hints).then((resolved) => sendResponse({ resolved }));
      return true; // async
    }

    return true;
  },
);

export { updateTabBadge, loadSettings };
