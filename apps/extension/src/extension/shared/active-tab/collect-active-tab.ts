import { ImageInfo, PageType } from '@mbd/core/types';

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

/**
 * Classifies the active tab's page type by messaging its content script.
 * Used to seed the popup's filter defaults (opt-in `smartPageDefaults`
 * setting). Unlike `collectFromActiveTab`, this never rejects — any failure
 * (no tab, no content script, runtime error) quietly resolves 'unknown' so a
 * classification hiccup never blocks or errors the scan it primes.
 */
export function getPageType(): Promise<PageType> {
  return new Promise((resolve) => {
    if (!chrome?.tabs?.query) return resolve('unknown');
    try {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (!tab?.id) return resolve('unknown');
          chrome.tabs.sendMessage(tab.id, 'GET_PAGE_TYPE', (pt: PageType) => {
            if (chrome.runtime.lastError) return resolve('unknown');
            resolve(pt ?? 'unknown');
          });
        })
        .catch(() => resolve('unknown'));
    } catch {
      resolve('unknown');
    }
  });
}
