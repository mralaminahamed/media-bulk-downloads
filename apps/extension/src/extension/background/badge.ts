import { ImageInfo } from '@mbd/core/types';
import { filterImagesBySettings, filterExcluded } from '@mbd/core/collection/filters';
import { currentSettings, excludedCache, settingsReady, excludedReady } from '@/extension/background/state';

export const BADGE_COLOR = '#4F46E5';
export const BADGE_ALERT_COLOR = '#DC2626';

// Download-failure alert: when the queue has failed items, the toolbar badge shows
// their count in red across every tab (overriding the per-tab media count) so a
// failure isn't silent while the popup is closed. It clears when the user opens the
// popup/bubble (they can see the failed rows). A NEW failure re-arms it even after
// a previous acknowledgement. State is in-memory (ephemeral across SW restarts —
// re-deriving from the persisted queue on wake simply re-alerts, which is fine).
let downloadFailed = 0;
let alertsAcked = false;

function downloadAlertActive(): boolean {
  return downloadFailed > 0 && !alertsAcked;
}

/** Update the failed-item count (from the persisted queue) and repaint badges. */
export function setDownloadFailedCount(failed: number): void {
  if (failed > downloadFailed) alertsAcked = false; // a new failure re-alerts
  downloadFailed = failed;
  if (failed === 0) alertsAcked = false;
  updateAllTabsBadges();
}

/** The user opened the popup/bubble and can see the failures — stop alerting. */
export function ackDownloadAlerts(): void {
  if (!downloadAlertActive()) return;
  alertsAcked = true;
  updateAllTabsBadges();
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
  // A download-failure alert overrides the per-tab media count (and shows even when
  // the count is disabled) so a failure is visible on any tab while the popup is closed.
  if (downloadAlertActive()) {
    chrome.action.setBadgeText({ text: String(downloadFailed), tabId });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_ALERT_COLOR, tabId });
    return;
  }
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
  if (downloadAlertActive() || currentSettings.showImageCount) {
    updateAllTabsBadges();
  } else {
    clearAllBadges();
  }
  updateAllTabsActionMode();
}
