/**
 * content.ts — content-script logic, loaded by the WXT content entrypoint
 * (src/entrypoints/content.ts).
 *
 * Answers GET_IMAGES for the popup and background badge, and mounts the on-page
 * bubble surface (dynamically imported) when the user has enabled it.
 */

import { SettingsData, DeepScanProgress } from '@/types';
import { collectMedia } from './collect';
import { ingestSniffedIgMedia } from './shared/resolvers/instagram';
import { withDefaults } from './shared/settings';
import { startDeepScan } from './content/deepScanRunner';

// Re-export the pure collection API (kept for tests and other importers).
export * from './collect';

// Relay the MAIN-world X/Twitter media sniffer's findings to the background.
// The sniffer (x-media-sniffer.content.ts) runs in the page realm to read the
// page's own GraphQL responses; it can't use chrome.*, so it postMessages here.
// Validate the envelope strictly (same window, same origin, our tag) before
// forwarding — the background then host-pins each URL.
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: unknown; pairs?: unknown } | null;
  if (!data || data.source !== 'ibd-x-media' || !Array.isArray(data.pairs)) return;
  chrome.runtime.sendMessage({ type: 'X_MEDIA_SEEN', pairs: data.pairs }).catch(() => {
    /* background may be asleep / no receiver */
  });
});

// Relay the MAIN-world Instagram media sniffer's findings into the resolver.
// The sniffer (ig-media-sniffer.content.ts) reads the page's own GraphQL /api
// responses (posts loaded on scroll) and postMessages the extracted media here.
// Unlike X, IG media resolves in-content (the real mp4 is in the response), so we
// feed the entries straight to the resolver's in-memory store — collectMedia()
// then resolves scroll-loaded posts with no network call. Validate the envelope
// here; ingestSniffedIgMedia re-validates and host-pins every entry (the payload
// crossed the page realm and is untrusted).
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: unknown; entries?: unknown } | null;
  if (!data || data.source !== 'ibd-ig-media' || !Array.isArray(data.entries)) return;
  ingestSniffedIgMedia(data.entries);
});

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
        clickLoadMore: s.deepScanClickLoadMore,
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
