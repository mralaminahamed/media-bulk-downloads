/**
 * content.ts — content-script logic, loaded by the WXT content entrypoint
 * (src/entrypoints/content.ts).
 *
 * Answers GET_IMAGES for the popup and background badge, and mounts the on-page
 * bubble surface (dynamically imported) when the user has enabled it.
 */

import { SettingsData, DeepScanProgress, SettingsChangedMessage } from '@mbd/core/types';
import { collectMedia } from '@/extension/content/collect';
import { ensureShopifyProduct } from '@/extension/content/shopify-product';
import { ingestSniffedIgMedia } from '@mbd/core/resolvers/sites/instagram';
import { ingestSniffedFbMedia } from '@mbd/core/resolvers/sites/facebook';
import { ingestSniffedPinterestMedia } from '@mbd/core/resolvers/sites/pinterest';
import { isPinterestHost } from '@mbd/core/resolvers/sniffers/pinterest-hosts';
import { ingestSniffedMangadexMedia } from '@mbd/core/resolvers/sites/mangadex';
import { isMangadexHost } from '@mbd/core/resolvers/sniffers/mangadex-media-sniff';
import { ingestSniffedHls } from '@mbd/core/resolvers/sniffers/hls-sniff';
import { withDefaults } from '@mbd/storage/settings';
import { loadEffectiveSettingsForHost } from '@mbd/storage/per-host-settings';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { classifyPage, collectPageSignals } from '@mbd/core/collection/pageType';

export * from '@/extension/content/collect';

const host = location.hostname;
const onXHost = host === 'x.com' || host === 'twitter.com';
const onIgHost = host === 'instagram.com' || host.endsWith('.instagram.com');
const onFbHost = host === 'facebook.com' || host.endsWith('.facebook.com');
const onPinterestHost = isPinterestHost(host);
const onMangadexHost = isMangadexHost(host);

if (onXHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; pairs?: unknown } | null;
    if (!data || data.source !== 'mbd-x-media' || !Array.isArray(data.pairs)) return;
    chrome.runtime.sendMessage({ type: 'X_MEDIA_SEEN', pairs: data.pairs }).catch(() => {
      /* background may be asleep / no receiver */
    });
  });
}

if (onIgHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; entries?: unknown } | null;
    if (!data || data.source !== 'mbd-ig-media' || !Array.isArray(data.entries)) return;
    ingestSniffedIgMedia(data.entries);
  });
}

if (onFbHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; entries?: unknown } | null;
    if (!data || data.source !== 'mbd-fb-media' || !Array.isArray(data.entries)) return;
    ingestSniffedFbMedia(data.entries);
  });

  window.postMessage({ source: 'mbd-fb-ready' }, location.origin);
}

if (onPinterestHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; entries?: unknown } | null;
    if (!data || data.source !== 'mbd-pinterest-media' || !Array.isArray(data.entries)) return;
    ingestSniffedPinterestMedia(data.entries);
  });

  window.postMessage({ source: 'mbd-pinterest-ready' }, location.origin);
}

if (onMangadexHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; entries?: unknown } | null;
    if (!data || data.source !== 'mbd-mangadex-media' || !Array.isArray(data.entries)) return;
    ingestSniffedMangadexMedia(data.entries);
  });

  window.postMessage({ source: 'mbd-mangadex-ready' }, location.origin);
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: unknown; urls?: unknown } | null;
  if (!data || data.source !== 'mbd-hls' || !Array.isArray(data.urls)) return;
  ingestSniffedHls(data.urls);
});
window.postMessage({ source: 'mbd-hls-ready' }, location.origin);

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender,
    sendResponse: (response: ReturnType<typeof collectMedia> | ReturnType<typeof classifyPage>) => void,
  ) => {
    if (message === 'GET_IMAGES') {
      void loadEffectiveSettingsForHost(location.hostname)
        .then(async (s) => {
          await ensureShopifyProduct(location.href);
          sendResponse(collectMedia(undefined, { smartPageDefaults: s.smartPageDefaults, resolveOriginals: s.resolveOriginals }));
        })
        // If the per-host settings read rejects, still answer (best-effort default
        // collection) — the channel is held open by `return true`, so never
        // calling sendResponse would hang the popup's await forever.
        .catch(() => sendResponse(collectMedia()));
      return true;
    } else if (message === 'GET_PAGE_TYPE') {
      sendResponse(classifyPage(collectPageSignals(document)));
      // Synchronous response — no need to keep the channel open.
    }
  },
);

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
    void loadEffectiveSettingsForHost(location.hostname)
      .then(async (s) => {
        await ensureShopifyProduct(location.href);
        startDeepScan(onProgress, signal, {
          maxItems: s.deepScanMaxItems,
          maxMs: s.deepScanMaxSeconds * 1000,
          maxScrolls: s.deepScanMaxScrolls,
          clickLoadMore: s.deepScanClickLoadMore,
          rememberScanBehaviour: s.rememberScanBehaviour,
        })
          .then((media) => sendResponse(media))
          .catch(() => sendResponse([]));
      })
      // Also answer if the settings read itself rejects — the inner catch only
      // covers startDeepScan, so without this the held-open channel would hang the
      // popup's deep-scan await forever on a transient storage error.
      .catch(() => sendResponse([]));
    return true;
  }
  if (message === 'DEEP_SCAN_ABORT') {
    deepScanAbort?.abort();
    sendResponse(true);
    return;
  }
});

let bubbleController: { unmount: () => void } | null = null;
let bubbleWanted = false;

async function mountBubble(settings: SettingsData): Promise<void> {
  if (bubbleController) return;
  const { mountBubble: mount } = await import('@/extension/bubble/mount');
  if (bubbleController || !bubbleWanted) return;
  bubbleController = mount(settings);
}

function unmountBubble(): void {
  bubbleController?.unmount();
  bubbleController = null;
}

function applyBubble(settings: SettingsData): void {
  bubbleWanted = settings.bubbleEnabled;
  if (settings.bubbleEnabled) {
    void mountBubble(settings);
  } else {
    unmountBubble();
  }
}

if (window.top === window.self) {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings?: Partial<SettingsData>) => {
    void chrome.runtime.lastError;
    applyBubble(withDefaults(settings));
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: string }).type === 'SETTINGS_CHANGED'
    ) {
      applyBubble(withDefaults((message as SettingsChangedMessage).settings));
    }
  });
}
