import { ChromeMessage, DownloadMessage, DownloadResponse, ImageInfo, SettingsData } from '@/types';
import { filterImagesBySettings } from './shared/filters';

export const DEFAULT_SETTINGS: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 460,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
};

let currentSettings: SettingsData = { ...DEFAULT_SETTINGS };

const BADGE_COLOR = '#4F46E5';

/**
 * Load the current settings from storage.
 */
function loadSettings(): void {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...result.settings };
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
 * Sanitizes a user-supplied path segment: strips path traversal, leading
 * slashes and characters illegal in download filenames. chrome.downloads
 * already rejects absolute paths and "..", but we normalize defensively.
 */
export function sanitizePathSegment(segment: string): string {
  return segment
    // Control chars are intentionally part of the illegal-filename set.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1f]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
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
    currentSettings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<SettingsData>) };
    applySettings();
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (currentSettings.showImageCount) {
    updateTabBadge(activeInfo.tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
