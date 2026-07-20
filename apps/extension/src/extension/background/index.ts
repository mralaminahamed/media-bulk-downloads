import { ChromeMessage, SettingsData } from '@mbd/core/types';
import { withDefaults } from '@mbd/storage/settings';
import { EXCLUDED_KEY } from '@mbd/storage/excluded';
import { markSaveAsPromptSeen } from '@mbd/storage/save-as-hint';
import { persistStorage, syncStores } from '@mbd/storage/sync';
import { initQueueDispatcher, reconcileQueue } from '@/extension/background/download/download-queue';
import {
  currentSettings, excludedReady, settingsReady,
  loadSettings, reloadExcluded, resolveSettingsGate, setCurrentSettings, setApplySettingsHook,
} from '@/extension/background/state';
import {
  applySettings, updateTabBadge, updateTabActionMode, updateAllTabsBadges, BADGE_COLOR,
} from '@/extension/background/badge';
import { snifferByTab } from '@/extension/background/sniffer-store';
import { setupContextMenus } from '@/extension/background/context-menu';
import { onCommand, onContextMenuClick } from '@/extension/background/commands';
import { messageRouter, broadcastSettings, type SendResponse } from '@/extension/background/message-router';

setApplySettingsHook(applySettings);

void persistStorage();
void syncStores();

chrome.contextMenus?.onClicked.addListener(onContextMenuClick);
chrome.commands?.onCommand.addListener(onCommand);
chrome.runtime.onStartup?.addListener(setupContextMenus);

chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
  setupContextMenus();
});

if (chrome.storage?.sync) {
  loadSettings();
}

initQueueDispatcher({
  getConcurrency: () => currentSettings.downloadConcurrency,
  getSaveAs: () => currentSettings.saveAs,
});
chrome.runtime.onStartup?.addListener(() => {
  void reconcileQueue();
});
void settingsReady.then(() => reconcileQueue()).catch(() => {});

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.error?.current === 'USER_CANCELED') void markSaveAsPromptSeen();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    const next = withDefaults(changes.settings.newValue as Partial<SettingsData>);
    setCurrentSettings(next);
    applySettings();
    resolveSettingsGate();
    broadcastSettings(next);
  } else if (namespace === 'local' && changes[EXCLUDED_KEY]) {
    reloadExcluded();
    if (currentSettings.showImageCount) void excludedReady.then(() => updateAllTabsBadges());
  }
});

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

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, 'TOGGLE_BUBBLE', () => void chrome.runtime.lastError);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
    if (typeof message !== 'object' || message === null) return false;
    const handler = messageRouter[message.type];
    if (!handler) return false;
    return (handler as (m: ChromeMessage, s: chrome.runtime.MessageSender, r: SendResponse) => boolean | void)(
      message,
      sender,
      sendResponse,
    );
  },
);

export { DEFAULT_SETTINGS } from '@mbd/storage/settings';
export { sanitizePathSegment } from '@mbd/core/collection/paths';
export { buildDownloadFilename, extensionForType, originalNameFromUrl } from '@mbd/core/collection/download-name';
export { loadSettings } from '@/extension/background/state';
export { isInjectableUrl, updateTabBadge } from '@/extension/background/badge';
export { downloadAndRecord, downloadStatusMessage } from '@/extension/background/download/downloads';
export { resolveOriginalsBatch, storeSniffedMedia } from '@/extension/background/sniffer-store';
export { setupContextMenus, mediaFromContext } from '@/extension/background/context-menu';
