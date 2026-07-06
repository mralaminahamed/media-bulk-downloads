import { defineContentScript } from 'wxt/utils/define-content-script';
import { installUrlSniffer } from '@/extension/shared/resolvers/response-sniffer';

/**
 * MAIN-world content script (all sites). Runs in the page's own realm at
 * document_start so it can wrap `fetch` / `XMLHttpRequest` before the app uses
 * them, and passively note the HLS `.m3u8` manifests players request — hls.js and
 * friends fetch the manifest via XHR/fetch, so it never appears in the DOM and is
 * invisible to DOM collection. It forges NO requests; it only observes URLs the
 * page already requests, then postMessages the new manifest URLs to the isolated
 * content script (which relays them into the collector). MAIN world can't use
 * `chrome.*`, hence the postMessage bridge.
 */
const HLS_RE = /\.m3u8(?:[?#]|$)/i;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const seen = new Set<string>(); // avoid re-posting the same manifest
    installUrlSniffer({
      isMatch: (url) => HLS_RE.test(url),
      onUrl: (url) => {
        if (seen.has(url)) return;
        seen.add(url);
        window.postMessage({ source: 'ibd-hls', urls: [url] }, location.origin);
      },
    });
  },
});
