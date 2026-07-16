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
import { ingestSniffedHls } from '@mbd/core/resolvers/sniffers/hls-sniff';
import { withDefaults } from '@mbd/storage/settings';
import { loadEffectiveSettingsForHost } from '@mbd/storage/per-host-settings';
import { startDeepScan } from '@/extension/content/deepScanRunner';
import { classifyPage, collectPageSignals } from '@mbd/core/collection/pageType';

// Re-export the pure collection API (kept for tests and other importers).
export * from '@/extension/content/collect';

// The MAIN-world sniffers only run on their own platforms, so the relay listeners
// they postMessage to are useful only there. Gate each by host so an unrelated
// <all_urls> page can't push a forged sniffer envelope — host-pinning downstream
// already blocks non-CDN URLs, but this removes the listener surface entirely.
const host = location.hostname;
// Bare hosts only — the X sniffer's `matches` are `*://x.com/*` / `*://twitter.com/*`
// (no `*.` wildcard), so the relay's trust surface must mirror them exactly. (The
// IG/FB gates below keep their `.host` subdomain checks because those sniffers DO
// match subdomains.)
const onXHost = host === 'x.com' || host === 'twitter.com';
const onIgHost = host === 'instagram.com' || host.endsWith('.instagram.com');
const onFbHost = host === 'facebook.com' || host.endsWith('.facebook.com');
const onPinterestHost = isPinterestHost(host);

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

// Relay the MAIN-world Pinterest media sniffer's findings into the resolver. The
// sniffer (pinterest-media-sniffer.content.ts) reads the page's own /resource/
// responses (feed pages loaded on scroll) and postMessages the extracted pins
// here. Like IG/FB, media resolves in-content (the real orig/mp4 is in the
// response), so we feed the entries straight to the resolver's in-memory store —
// collectMedia() then surfaces scroll-loaded pins with no network call. Validate
// the envelope here; ingestSniffedPinterestMedia re-validates and host-pins every
// entry (the payload crossed the page realm and is untrusted).
if (onPinterestHost) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; entries?: unknown } | null;
    if (!data || data.source !== 'ibd-pinterest-media' || !Array.isArray(data.entries)) return;
    ingestSniffedPinterestMedia(data.entries);
  });

  // Tell the MAIN-world sniffer we're listening now, so it replays any /resource/
  // response captured before this relay registered (the initial feed loads at
  // document_start). Mirrors the FB ready-replay.
  window.postMessage({ source: 'ibd-pinterest-ready' }, location.origin);
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
      void loadEffectiveSettingsForHost(location.hostname)
        .then(async (s) => {
          // Prime the Shopify store (same-origin /products/<handle>.js fetch) before
          // the synchronous, network-free collectMedia reads it. Best-effort and
          // no-op off a Shopify product page — never blocks collection beyond its
          // own short timeout.
          await ensureShopifyProduct(location.href);
          sendResponse(collectMedia(undefined, { smartPageDefaults: s.smartPageDefaults, resolveOriginals: s.resolveOriginals }));
        })
        // If the per-host settings read rejects, still answer (best-effort default
        // collection) — the channel is held open by `return true`, so never
        // calling sendResponse would hang the popup's await forever.
        .catch(() => sendResponse(collectMedia()));
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
    void loadEffectiveSettingsForHost(location.hostname)
      .then((s) => {
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
// Desired state, tracked separately from the live controller. A disable that
// arrives while the bubble chunk is still importing finds bubbleController null,
// so unmountBubble is a no-op — without this flag the mount would then complete
// and the bubble would appear against the user's last (disabled) setting until the
// next toggle. mountBubble re-checks it after the import resolves.
let bubbleWanted = false;

async function mountBubble(settings: SettingsData): Promise<void> {
  if (bubbleController) return;
  const { mountBubble: mount } = await import('@/extension/bubble/mount');
  // A concurrent unmount/disable may have raced in while the chunk loaded — bail
  // if the bubble is no longer wanted (or another mount already won).
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

// Don't inject into framed documents — only the top-level page.
if (window.top === window.self) {
  // Get settings from the background rather than reading chrome.storage.sync
  // here: Safari content scripts don't reliably see the sync writes the popup
  // makes, nor fire storage.onChanged for them, so the bubble would never mount.
  // The background owns settings and pushes SETTINGS_CHANGED after every write —
  // message passing works across Chrome/Firefox/Edge/Safari alike.
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings?: Partial<SettingsData>) => {
    // No receiver (worker still waking): fall back to defaults; a SETTINGS_CHANGED
    // push or the next navigation's GET_SETTINGS will mount it once available.
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
