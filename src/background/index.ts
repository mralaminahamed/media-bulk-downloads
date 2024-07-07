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

chrome.runtime.onInstalled.addListener(() => {
  console.log('Image Bulk Downloads extension installed');
  loadSettings();
});

function loadSettings() {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      currentSettings = result.settings;
      applySettings();
    }
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    currentSettings = changes.settings.newValue;
    applySettings();
  }
});

function applySettings() {
  if (!currentSettings.showImageCount) {
    clearAllBadges();
  } else {
    updateAllTabsBadges();
  }
}

function clearAllBadges() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    });
  });
}

function updateAllTabsBadges() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        updateTabBadge(tab.id);
      }
    });
  });
}

function updateTabBadge(tabId: number) {
  chrome.tabs.sendMessage(tabId, 'GET_IMAGES', (images: ImageInfo[]) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
    } else if (images) {
      const filteredImages = filterImages(images);
      const badgeText = filteredImages.length.toString();
      chrome.action.setBadgeText({ text: badgeText, tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
    }
  });
}

function filterImages(images: ImageInfo[]): ImageInfo[] {
  return images.filter(img =>
      (img.width >= currentSettings.minimumImageSize && img.height >= currentSettings.minimumImageSize) &&
      (!currentSettings.excludeBase64Images || !img.src.startsWith('data:'))
  );
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (currentSettings.showImageCount) {
      updateTabBadge(tabId);
    }
  }
});

chrome.runtime.onMessage.addListener((
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: DownloadResponse) => void
) => {
  if (typeof message === 'object' && message.type === 'DOWNLOAD_IMAGES') {
    const downloadMessage = message as DownloadMessage;
    const images: ImageInfo[] = downloadMessage.images;

    const filteredImages = filterImages(images);

    filteredImages.forEach((image, index) => {
      const fileExtension = image.src.split('.').pop()?.split('?')[0] || 'jpg';
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

export {}
