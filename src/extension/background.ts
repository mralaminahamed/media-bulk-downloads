import { ChromeMessage, DownloadMessage, DownloadResponse, ImageInfo, SettingsData } from '@/types';
import { filterImagesBySettings } from './shared/filters';
import { DEFAULT_SETTINGS, withDefaults } from './shared/settings';
import { sanitizePathSegment } from './shared/paths';

export { DEFAULT_SETTINGS, sanitizePathSegment };

let currentSettings: SettingsData = { ...DEFAULT_SETTINGS };

const BADGE_COLOR = '#4F46E5';

/**
 * Load the current settings from storage.
 */
function loadSettings(): void {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      currentSettings = withDefaults(result.settings);
      applySettings();
    }
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
  const prefix = sanitizePathSegment(settings.fileNamePrefix) || 'image_';
  const extension = extensionForType(image.type);
  const fileName = `${prefix}${index + 1}.${extension}`;
  const dir = sanitizePathSegment(settings.downloadPath);
  return dir ? `${dir}/${fileName}` : fileName;
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
    sendResponse: (response: DownloadResponse) => void,
  ) => {
    if (typeof message === 'object' && message.type === 'DOWNLOAD_IMAGES') {
      const { images } = message as DownloadMessage;
      const eligible = filterImagesBySettings(images, currentSettings);

      eligible.forEach((image, index) => {
        chrome.downloads.download({
          url: image.src,
          filename: buildDownloadFilename(image, index, currentSettings),
          saveAs: false,
        });
      });

      sendResponse({ status: 'success', message: `Downloading ${eligible.length} images...` });
    }
    return true;
  },
);

export { updateTabBadge, loadSettings };
