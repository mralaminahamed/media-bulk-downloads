import { ImageInfo } from '@/types';

/**
 * Collects images from the active tab by messaging its content script.
 * Used by the popup surface (which lives outside the page).
 */
export async function collectFromActiveTab(): Promise<ImageInfo[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found.');
  }

  return new Promise<ImageInfo[]>((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id as number, 'GET_IMAGES', (images: ImageInfo[]) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'unknown error'));
        return;
      }
      resolve(Array.isArray(images) ? images : []);
    });
  });
}
