import { ChromeMessage, DownloadMessage, DownloadResponse, ImageInfo } from '../types';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Image Bulk Downloads extension installed');
});

chrome.runtime.onMessage.addListener((
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: DownloadResponse) => void
) => {
  if (typeof message === 'object' && message.type === 'DOWNLOAD_IMAGES') {
    const downloadMessage = message as DownloadMessage;
    const images: ImageInfo[] = downloadMessage.images;
    images.forEach((image, index) => {
      chrome.downloads.download({
        url: image.src,
        filename: `image_${index + 1}.${image.src.split('.').pop()?.split('?')[0] || 'jpg'}`,
        saveAs: false
      });
    });
    sendResponse({ status: 'success', message: `Downloading ${images.length} images...` });
  }
  return true;
});

export {}
