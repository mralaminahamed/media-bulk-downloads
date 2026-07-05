/**
 * content.ts — content-script logic, loaded by the WXT content entrypoint
 * (src/entrypoints/content.ts).
 *
 * Answers GET_IMAGES for the popup and background badge, and mounts the on-page
 * bubble surface (dynamically imported) when the user has enabled it.
 */

import { SettingsData, DeepScanProgress } from '@/types';
import { collectMedia } from './collect';
import { withDefaults } from './shared/settings';
import { startDeepScan } from './content/deepScanRunner';

// Re-export the pure collection API (kept for tests and other importers).
export * from './collect';

// Answer image-collection requests from the popup and background worker.
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (response: ReturnType<typeof collectMedia>) => void) => {
    if (message === 'GET_IMAGES') {
      sendResponse(collectMedia());
    }
    // Synchronous response — no need to keep the channel open.
  },
);

// ── Deep scan lifecycle ─────────────────────────────────────────────────────
let deepScanAbort: AbortController | null = null;

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (message === 'DEEP_SCAN') {
    deepScanAbort?.abort();
    deepScanAbort = new AbortController();
    const signal = deepScanAbort.signal;
    const onProgress: Parameters<typeof startDeepScan>[0] = (found, scrolls, elapsedMs, reason) => {
      const p: DeepScanProgress = { type: 'DEEP_SCAN_PROGRESS', found, scrolls, elapsedMs };
      if (reason) p.reason = reason;
      chrome.runtime.sendMessage(p).catch(() => {
        /* popup may be closed */
      });
    };
    // Read the user's configurable caps before starting; fall back to defaults.
    chrome.storage.sync.get(['settings'], (result) => {
      const s = withDefaults(result.settings);
      startDeepScan(onProgress, signal, {
        maxItems: s.deepScanMaxItems,
        maxMs: s.deepScanMaxSeconds * 1000,
        maxScrolls: s.deepScanMaxScrolls,
      })
        .then((media) => sendResponse(media))
        .catch(() => sendResponse([]));
    });
    return true; // async response
  }
  if (message === 'DEEP_SCAN_ABORT') {
    deepScanAbort?.abort();
    sendResponse(true);
    return; // sync
  }
});

// ── On-page bubble lifecycle ────────────────────────────────────────────────
let bubbleController: { unmount: () => void } | null = null;

async function mountBubble(settings: SettingsData): Promise<void> {
  if (bubbleController) return;
  const { mountBubble: mount } = await import('./bubble/mount');
  // A concurrent unmount may have raced in while the chunk loaded.
  if (bubbleController) return;
  bubbleController = mount(settings);
}

function unmountBubble(): void {
  bubbleController?.unmount();
  bubbleController = null;
}

function applyBubble(settings: SettingsData): void {
  if (settings.bubbleEnabled) {
    void mountBubble(settings);
  } else {
    unmountBubble();
  }
}

// Don't inject into framed documents — only the top-level page.
if (window.top === window.self) {
  chrome.storage.sync.get(['settings'], (result) => applyBubble(withDefaults(result.settings)));

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.settings) {
      applyBubble(withDefaults(changes.settings.newValue as Partial<SettingsData>));
    }
  });
}
