/**
 * content.ts — content-script logic, loaded by the WXT content entrypoint
 * (src/entrypoints/content.ts).
 *
 * Answers GET_IMAGES for the popup and background badge, and mounts the on-page
 * bubble surface (dynamically imported) when the user has enabled it.
 */

import { SettingsData, DeepScanProgress, OriginalCaptureProgress } from '@/types';
import { collectMedia } from './collect';
import { ingestSniffedIgMedia } from '../shared/resolvers/sites/instagram';
import { ingestSniffedFbMedia } from '../shared/resolvers/sites/facebook';
import { ingestSniffedHls } from '../shared/resolvers/sniffers/hls-sniff';
import { withDefaults } from '../shared/storage/settings';
import { startDeepScan } from './deepScanRunner';
import { startOriginalCapture, runCaptureOnLoadedTiles } from './originalCaptureRunner';

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

// Whether a deep scan on this host should chain into an original-capture pass
// once its scroll loop finishes. Pure and exported so it's directly testable
// without wiring up the message-listener harness.
export function shouldChainCapture(host: string, s: SettingsData): boolean {
  const onFb = host === 'facebook.com' || host.endsWith('.facebook.com');
  return onFb && s.fbCaptureOriginals;
}

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
        .then(async (media) => {
          if (!shouldChainCapture(host, s)) return media;
          // Deep scan already scrolled, so capture the loaded tiles (no re-scroll),
          // then re-collect so the resolver upgrades every tile to its original.
          const captureProgress = (
            opened: number,
            captured: number,
            total: number,
            reason?: OriginalCaptureProgress['reason'],
          ) => {
            const p: OriginalCaptureProgress = { type: 'FB_CAPTURE_PROGRESS', opened, captured, total };
            if (reason) p.reason = reason;
            chrome.runtime.sendMessage(p).catch(() => {
              /* popup may be closed */
            });
          };
          await runCaptureOnLoadedTiles(captureProgress, signal, {
            maxPhotos: s.fbCaptureMaxPhotos,
            maxMs: s.fbCaptureMaxSeconds * 1000,
          });
          return collectMedia();
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

// ── Facebook original-capture lifecycle ─────────────────────────────────────
let captureAbort: AbortController | null = null;

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (message === 'FB_CAPTURE_ORIGINALS') {
    captureAbort?.abort();
    captureAbort = new AbortController();
    const signal = captureAbort.signal;
    const onProgress: Parameters<typeof startOriginalCapture>[0] = (opened, captured, total, reason) => {
      const p: OriginalCaptureProgress = { type: 'FB_CAPTURE_PROGRESS', opened, captured, total };
      if (reason) p.reason = reason;
      chrome.runtime.sendMessage(p).catch(() => {
        /* popup may be closed */
      });
    };
    // Read the user's configurable caps before starting; fall back to defaults.
    chrome.storage.sync.get(['settings'], (result) => {
      const s = withDefaults(result.settings);
      startOriginalCapture(onProgress, signal, {
        maxPhotos: s.fbCaptureMaxPhotos,
        maxMs: s.fbCaptureMaxSeconds * 1000,
      })
        .then((media) => sendResponse(media))
        .catch(() => sendResponse([]));
    });
    return true; // async response
  }
  if (message === 'FB_CAPTURE_ABORT') {
    captureAbort?.abort();
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
