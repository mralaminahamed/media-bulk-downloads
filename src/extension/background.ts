import { ChromeMessage, DownloadMessage, DownloadResponse, ImageInfo, SettingsData } from '@/types';

let currentSettings: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 400,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
};

/**
 * Load the current settings from storage
 */
function loadSettings() {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      currentSettings = result.settings;
      applySettings();
    }
  });
}

/**
 * Apply the current settings to all tabs
 */
function applySettings() {
  if (!currentSettings.showImageCount) {
    clearAllBadges();
  } else {
    updateAllTabsBadges();
  }
}

/**
 * Clear the badge text for all tabs
 */
function clearAllBadges() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    });
  });
}

/**
 * Update the badge text for all tabs
 */
function updateAllTabsBadges() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        updateTabBadge(tab.id);
      }
    });
  });
}

/**
 * Update the badge text for the given tab
 *
 * @param {number} tabId The ID of the tab to update
 */
function updateTabBadge(tabId: number) {
  chrome.tabs.sendMessage(tabId, 'GET_IMAGES', (images: ImageInfo[]) => {
    // Ignore errors when sending messages to tabs
    if (chrome.runtime.lastError) {
      return;
    }

    // Show the badge only if there are images on the page
    if (images) {
      const filteredImages = filterImages(images);
      const badgeText = filteredImages.length.toString();
      chrome.action.setBadgeText({ text: badgeText, tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#4F46E5', tabId });
    }
  });
}

function filterImages(images: ImageInfo[]): ImageInfo[] {
  return images.filter(img =>
      (img.width >= currentSettings.minimumImageSize && img.height >= currentSettings.minimumImageSize) &&
      (!currentSettings.excludeBase64Images || !img.isBase64) // Changed from checking src to using isBase64 property
  );
}

console.log('Background script loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Image Bulk Downloads extension installed');
  loadSettings();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    currentSettings = changes.settings.newValue;
    applySettings();
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    if (currentSettings.showImageCount) {
        updateTabBadge(activeInfo.tabId);
    }
} );

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (currentSettings.showImageCount) {
      updateTabBadge(tabId);
    }
  } else{
    chrome.action.setBadgeText({ text: '...', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4F46E5', tabId });
  }
});

chrome.runtime.onMessage.addListener((message: ChromeMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: DownloadResponse) => void) => {
  if (typeof message === 'object' && message.type === 'DOWNLOAD_IMAGES') {
    const downloadMessage = message as DownloadMessage;
    const images: ImageInfo[] = downloadMessage.images;

    const filteredImages = filterImages(images);

    filteredImages.forEach((image, index) => {
      const fileExtension = image.type || 'jpg'; // Use the image type instead of parsing from URL
      const fileName = `${currentSettings.fileNamePrefix}${index + 1}.${fileExtension}`;
      const fullPath = currentSettings.downloadPath ? `${currentSettings.downloadPath}/${fileName}` : fileName;

      chrome.downloads.download({
        url: image.src,
        filename: fullPath,
        saveAs: false
      });
    });

    sendResponse({ status: 'success', message: `Downloading ${filteredImages.length} images...` });
  }
  return true;
});

export { filterImages, updateTabBadge, loadSettings }; // Export for testing
