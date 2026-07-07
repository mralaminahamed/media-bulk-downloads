import { defineContentScript } from 'wxt/utils/define-content-script';
import { installReplayOnReady, installUrlSniffer } from '@/extension/shared/resolvers/sniffers/response-sniffer';

/**
 * MAIN-world content script (all sites). Runs in the page's own realm at
 * document_start so it can wrap `fetch` / `XMLHttpRequest` before the app uses
 * them, and passively note the HLS `.m3u8` / DASH `.mpd` manifests players
 * request — hls.js, dash.js, and friends fetch the manifest via XHR/fetch, so it
 * never appears in the DOM and is invisible to DOM collection. It forges NO
 * requests; it only observes URLs the page already requests, then postMessages
 * the new manifest URLs to the isolated content script (which relays them into
 * the collector). MAIN world can't use `chrome.*`, hence the postMessage bridge.
 */
// Matches both HLS (.m3u8) and DASH (.mpd) manifests the page fetches.
const HLS_RE = /\.(m3u8|mpd)(?:[?#]|$)/i;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const seen = new Set<string>(); // avoid re-posting the same manifest
    const post = (urls: string[]): void => window.postMessage({ source: 'ibd-hls', urls }, location.origin);
    installUrlSniffer({
      isMatch: (url) => HLS_RE.test(url),
      onUrl: (url) => {
        if (seen.has(url)) return;
        seen.add(url);
        post([url]);
      },
    });
    // This sniffer runs at document_start; the isolated relay that ingests these
    // posts only registers at document_idle. Manifests fetched in that gap
    // (autoplay/preload players) would be lost, so when the relay announces
    // itself, re-post everything seen so far (the ingest side dedups).
    installReplayOnReady('ibd-hls-ready', () => {
      if (seen.size) post([...seen]);
    });
  },
});
