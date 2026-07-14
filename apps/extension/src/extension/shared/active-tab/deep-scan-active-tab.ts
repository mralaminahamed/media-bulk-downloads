import { MediaItem, DeepScanProgress } from '@mbd/core/types';

// The tab a scan is running in, so Abort targets that tab even if the user has
// since switched to another one.
let activeScanTabId: number | null = null;

/** Runs Deep scan in the active tab, streaming progress until it resolves. */
export async function deepScanActiveTab(
  onProgress: (p: DeepScanProgress) => void,
): Promise<MediaItem[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  const tabId = tab.id;
  activeScanTabId = tabId;

  const listener = (msg: unknown, sender: chrome.runtime.MessageSender) => {
    // Only accept progress from the tab this scan is driving — otherwise a scan
    // in another tab would cross-contaminate this one's progress.
    if (sender?.tab?.id !== tabId) return;
    if (msg && (msg as DeepScanProgress).type === 'DEEP_SCAN_PROGRESS') onProgress(msg as DeepScanProgress);
  };
  chrome.runtime.onMessage.addListener(listener);

  try {
    return await new Promise<MediaItem[]>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, 'DEEP_SCAN', (media: MediaItem[]) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message || 'deep scan failed'));
        else resolve(Array.isArray(media) ? media : []);
      });
    });
  } finally {
    chrome.runtime.onMessage.removeListener(listener);
    if (activeScanTabId === tabId) activeScanTabId = null;
  }
}

export function abortDeepScanActiveTab(): void {
  // Prefer the tab the scan actually started in; fall back to the active tab.
  if (activeScanTabId != null) {
    chrome.tabs.sendMessage(activeScanTabId, 'DEEP_SCAN_ABORT', () => void chrome.runtime.lastError);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, 'DEEP_SCAN_ABORT', () => void chrome.runtime.lastError);
  });
}
