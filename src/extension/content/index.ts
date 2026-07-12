/**
 * content.ts — content-script logic, loaded by the WXT content entrypoint
 * (src/entrypoints/content.ts).
 *
 * Answers GET_IMAGES for the popup and background badge, and mounts the on-page
 * bubble surface (dynamically imported) when the user has enabled it.
 */

import { SettingsData, DeepScanProgress } from '@/types';
import { collectMedia } from './collect';
import { ingestSniffedIgMedia } from '../shared/resolvers/sites/instagram';
import { ingestSniffedFbMedia } from '../shared/resolvers/sites/facebook';
import { ingestSniffedHls } from '../shared/resolvers/sniffers/hls-sniff';
import { withDefaults } from '../shared/storage/settings';
import { loadEffectiveSettingsForHost } from '../shared/storage/per-host-settings';
import { startDeepScan } from './deepScanRunner';
import { classifyPage, collectPageSignals } from '../shared/collection/pageType';

// Re-export the pure collection API (kept for tests and other importers).
export * from './collect';

// The MAIN-world sniffers only run on their own platforms, so the relay listeners
// they postMessage to are useful only there. Gate each by host so an unrelated
// <all_urls> page can't push a forged sniffer envelope — host-pinning downstream
// already blocks non-CDN URLs, but this removes the listener surface entirely.
const host = location.hostname;
const onXHost = host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
const onIgHost = host === 'instagram.com' || host.endsWith('.instagram.com');
const onFbHost = host === 'facebook.com' || host.endsWith('.facebook.com');

// Relay the MAIN-world X/Twitter media sniffer's findings to the background.
// The sniffer (x-media-sniffer.content.ts) runs in the page realm to read the
// page's own GraphQL responses; it can't use chrome.*, so it postMessages here.
// Validate the envelope strictly (same window, same origin, our tag) before
// forwarding — the background then host-pins each URL.
if (onXHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; pairs?: unknown } | null;
    if (!data || data.source !== 'ibd-x-media' || !Array.isArray(data.pairs)) return;
    chrome.runtime.sendMessage({ type: 'X_MEDIA_SEEN', pairs: data.pairs }).catch(() => {
      /* background may be asleep / no receiver */
    });
  });
}

// Relay the MAIN-world Instagram media sniffer's findings into the resolver.
// The sniffer (ig-media-sniffer.content.ts) reads the page's own GraphQL /api
// responses (posts loaded on scroll) and postMessages the extracted media here.
// Unlike X, IG media resolves in-content (the real mp4 is in the response), so we
// feed the entries straight to the resolver's in-memory store — collectMedia()
// then resolves scroll-loaded posts with no network call. Validate the envelope
// here; ingestSniffedIgMedia re-validates and host-pins every entry (the payload
// crossed the page realm and is untrusted).
if (onIgHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; entries?: unknown } | null;
    if (!data || data.source !== 'ibd-ig-media' || !Array.isArray(data.entries)) return;
    ingestSniffedIgMedia(data.entries);
  });
}

// Relay the MAIN-world Facebook media sniffer's findings into the resolver.
// The sniffer (fb-media-sniffer.content.ts) reads the page's own /api/graphql
// responses (photos/videos loaded on scroll/open) and postMessages the extracted
// media here. Like IG, FB media resolves in-content (the real mp4/full-res image
// is in the response), so we feed the entries straight to the resolver's
// in-memory store — collectMedia() then resolves scroll-loaded posts with no
// network call. Validate the envelope here; ingestSniffedFbMedia re-validates and
// host-pins every entry (the payload crossed the page realm and is untrusted).
if (onFbHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; entries?: unknown } | null;
    if (!data || data.source !== 'ibd-fb-media' || !Array.isArray(data.entries)) return;
    ingestSniffedFbMedia(data.entries);
  });

  // Tell the MAIN-world FB sniffer we're listening now, so it replays any
  // /api/graphql it captured before this relay registered (mirrors the HLS relay
  // below). The sniffer's replay listener validates same-window + same-origin.
  window.postMessage({ source: 'ibd-fb-ready' }, location.origin);
}

// Relay the MAIN-world HLS/DASH sniffer's findings into the collector's store.
// Unlike the X/IG sniffers, streams appear on any site, so this runs on every
// host (the sniffer matches <all_urls>). The envelope crossed the page realm and
// is untrusted; ingestSniffedHls re-validates every URL (http(s) + .m3u8/.mpd) —
// the same class the DOM path already surfaces, so no new capability, only new
// coverage.
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: unknown; urls?: unknown } | null;
  if (!data || data.source !== 'ibd-hls' || !Array.isArray(data.urls)) return;
  ingestSniffedHls(data.urls);
});
// The sniffer runs at document_start but this relay only registered now
// (document_idle). Announce readiness so the sniffer re-posts any manifests it
// saw before this listener existed (ingestSniffedHls dedups the replay).
window.postMessage({ source: 'ibd-hls-ready' }, location.origin);

// Answer image-collection requests from the popup and background worker, and
// the popup's page-type classification request (used to seed filter defaults
// when the opt-in `smartPageDefaults` setting is on — a pure DOM read, no
// network).
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender,
    sendResponse: (response: ReturnType<typeof collectMedia> | ReturnType<typeof classifyPage>) => void,
  ) => {
    if (message === 'GET_IMAGES') {
      // Effective settings = global merged with this host's per-host override
      // (#293). smartPageDefaults may reorder collectMedia's hero pass; the
      // channel stays open for the async storage read.
      void loadEffectiveSettingsForHost(location.hostname).then((s) => {
        sendResponse(collectMedia(undefined, { smartPageDefaults: s.smartPageDefaults }));
      });
      return true; // async response — keep the channel open
    } else if (message === 'GET_PAGE_TYPE') {
      sendResponse(classifyPage(collectPageSignals(document)));
      // Synchronous response — no need to keep the channel open.
    }
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
    // Read this host's effective deep-scan caps before starting (#293).
    void loadEffectiveSettingsForHost(location.hostname).then((s) => {
      startDeepScan(onProgress, signal, {
        maxItems: s.deepScanMaxItems,
        maxMs: s.deepScanMaxSeconds * 1000,
        maxScrolls: s.deepScanMaxScrolls,
        clickLoadMore: s.deepScanClickLoadMore,
        rememberScanBehaviour: s.rememberScanBehaviour,
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
  const { mountBubble: mount } = await import('../bubble/mount');
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
