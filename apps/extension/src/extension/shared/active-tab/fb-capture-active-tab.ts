import { MediaItem, OriginalCaptureProgress } from '@mbd/core/types';

// The tab a capture is running in, so Abort targets that tab even if the user
// has since switched to another one.
let activeCaptureTabId: number | null = null;

/** Runs Facebook original-capture in the active tab, streaming progress until it resolves. */
export async function captureOriginalsActiveTab(
  onProgress: (p: OriginalCaptureProgress) => void,
): Promise<MediaItem[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  const tabId = tab.id;
  activeCaptureTabId = tabId;

  const listener = (msg: unknown, sender: chrome.runtime.MessageSender) => {
    // Only accept progress from the tab this capture is driving — otherwise a
    // capture in another tab would cross-contaminate this one's progress.
    if (sender?.tab?.id !== tabId) return;
    if (msg && (msg as OriginalCaptureProgress).type === 'FB_CAPTURE_PROGRESS') onProgress(msg as OriginalCaptureProgress);
  };
  chrome.runtime.onMessage.addListener(listener);

  try {
    return await new Promise<MediaItem[]>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, 'FB_CAPTURE_ORIGINALS', (media: MediaItem[]) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message || 'capture failed'));
        else resolve(Array.isArray(media) ? media : []);
      });
    });
  } finally {
    chrome.runtime.onMessage.removeListener(listener);
    if (activeCaptureTabId === tabId) activeCaptureTabId = null;
  }
}

export function abortCaptureOriginalsActiveTab(): void {
  // Prefer the tab the capture actually started in; fall back to the active tab.
  if (activeCaptureTabId != null) {
    chrome.tabs.sendMessage(activeCaptureTabId, 'FB_CAPTURE_ABORT', () => void chrome.runtime.lastError);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, 'FB_CAPTURE_ABORT', () => void chrome.runtime.lastError);
  });
}
