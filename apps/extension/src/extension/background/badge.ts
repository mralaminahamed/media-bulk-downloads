import { ImageInfo } from '@mbd/core/types';
import { filterImagesBySettings, filterExcluded } from '@mbd/core/collection/filters';
import { currentSettings, excludedCache, settingsReady, excludedReady } from '@/extension/background/state';

export const BADGE_COLOR = '#4F46E5';

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
export function updateTabActionMode(tabId: number, url: string | undefined): void {
  const useBubble = currentSettings.bubbleEnabled && isInjectableUrl(url);
  chrome.action.setPopup({ tabId, popup: useBubble ? '' : 'popup.html' });
}

export function updateAllTabsActionMode(): void {
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
export function clearAllBadges(): void {
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
export function updateAllTabsBadges(): void {
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
export function updateTabBadge(tabId: number): void {
  void Promise.all([settingsReady, excludedReady]).then(() => {
    chrome.tabs.sendMessage(tabId, 'GET_IMAGES', (images: ImageInfo[]) => {
      if (chrome.runtime.lastError) {
        chrome.action.setBadgeText({ text: '', tabId });
        return;
      }

      if (images) {
        const eligible = filterExcluded(filterImagesBySettings(images, currentSettings), excludedCache);
        const badgeText = eligible.length.toString();
        chrome.action.setBadgeText({ text: badgeText, tabId });
        chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
      }
    });
  });
}

/**
 * Apply the current settings to all tabs.
 */
export function applySettings(): void {
  if (!currentSettings.showImageCount) {
    clearAllBadges();
  } else {
    updateAllTabsBadges();
  }
  updateAllTabsActionMode();
}
