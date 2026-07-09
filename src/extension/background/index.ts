import { ChromeMessage, SettingsData } from '@/types';
import { withDefaults } from '../shared/storage/settings';
import { EXCLUDED_KEY } from '../shared/storage/excluded';
import { initQueueDispatcher, reconcileQueue } from './download-queue';
import {
  currentSettings, excludedReady, settingsReady,
  loadSettings, reloadExcluded, resolveSettingsGate, setCurrentSettings, setApplySettingsHook,
} from './state';
import {
  applySettings, updateTabBadge, updateTabActionMode, updateAllTabsBadges, BADGE_COLOR,
} from './badge';
import { snifferByTab } from './sniffer-store';
import { setupContextMenus } from './context-menu';
import { onCommand, onContextMenuClick } from './commands';
import { messageRouter, type SendResponse } from './message-router';

// state.ts drives badge/action-mode updates through a hook so it never imports
// badge.ts (keeps the module graph acyclic); wire it before the first load.
setApplySettingsHook(applySettings);

chrome.contextMenus?.onClicked.addListener(onContextMenuClick);
chrome.commands?.onCommand.addListener(onCommand);
chrome.runtime.onStartup?.addListener(setupContextMenus);

chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
  setupContextMenus();
});

// Service workers are ephemeral; reload settings whenever the worker starts.
if (chrome.storage?.sync) {
  loadSettings();
}

// Wire the persistent download queue (#196). Concurrency + saveAs are read
// lazily so a queue item dispatched later always uses the current settings, even
// if the worker woke before settings finished loading. On startup, reconcile any
// downloads left mid-flight when the worker died, then resume pending items.
initQueueDispatcher({
  getConcurrency: () => currentSettings.downloadConcurrency,
  getSaveAs: () => currentSettings.saveAs,
});
chrome.runtime.onStartup?.addListener(() => {
  void reconcileQueue();
});
void settingsReady.then(() => reconcileQueue()).catch(() => {});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    setCurrentSettings(withDefaults(changes.settings.newValue as Partial<SettingsData>));
    applySettings();
    // A change event also means settings are now known — resolve the gate so a
    // download isn't left waiting on the initial read.
    resolveSettingsGate();
  } else if (namespace === 'local' && changes[EXCLUDED_KEY]) {
    // The blocklist lives in storage.local (see excluded.ts). Refresh the live
    // matcher cache, then recompute every tab's badge once it loads so the
    // toolbar count matches the popup grid immediately (they otherwise drift
    // until the next tab switch/reload).
    reloadExcluded();
    if (currentSettings.showImageCount) void excludedReady.then(() => updateAllTabsBadges());
  }
});

// Drop a tab's sniffed-media map when it closes (no persistence, no leak).
chrome.tabs.onRemoved.addListener((tabId) => {
  snifferByTab.delete(tabId);
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
  // A same-tab navigation invalidates that tab's sniffed media (it belongs to the
  // previous page); drop it so a new page can't be served a stale mediaId. (The
  // map is also dropped on tab close; this covers long-lived tabs that navigate.)
  if (changeInfo.url) snifferByTab.delete(tabId);

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
  (message: ChromeMessage, sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
    // A bare string / null message (not one of ours) has no handler; ignore it.
    if (typeof message !== 'object' || message === null) return false;
    const handler = messageRouter[message.type];
    // Unmatched (e.g. the content script's DEEP_SCAN_PROGRESS broadcast) → no
    // response, so the channel closes immediately instead of leaking a port.
    if (!handler) return false;
    // The mapped router type guarantees the handler matches message.type, but TS
    // can't correlate the dynamic lookup — one cast here; each handler above is
    // authored against its own narrowed message type.
    return (handler as (m: ChromeMessage, s: chrome.runtime.MessageSender, r: SendResponse) => boolean | void)(
      message,
      sender,
      sendResponse,
    );
  },
);

// Re-exported for the background test suite, which imports these from the barrel.
export { DEFAULT_SETTINGS } from '../shared/storage/settings';
export { sanitizePathSegment } from '../shared/collection/paths';
export { buildDownloadFilename, extensionForType, originalNameFromUrl } from '../shared/collection/download-name';
export { loadSettings } from './state';
export { isInjectableUrl, updateTabBadge } from './badge';
export { downloadAndRecord } from './downloads';
export { resolveOriginalsBatch, storeSniffedMedia } from './sniffer-store';
export { setupContextMenus, mediaFromContext } from './context-menu';
