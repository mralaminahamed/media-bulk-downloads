/**
 * content.ts — content-script entry.
 *
 * Answers GET_IMAGES for the popup and background badge, and lazily mounts the
 * on-page bubble surface when the user has enabled it. The heavy bubble UI
 * (React) is code-split behind a dynamic import so pages without the bubble
 * enabled stay lightweight.
 */

import { SettingsData } from '@/types';
import { collectMedia } from './collect';
import { withDefaults } from './shared/settings';

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
