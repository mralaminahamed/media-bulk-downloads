import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractVideoPairs } from '@/extension/shared/resolvers/x-media-sniff';
import { installResponseSniffer, makeSnifferEmit } from '@/extension/shared/resolvers/response-sniffer';

/**
 * MAIN-world content script for x.com / twitter.com. Runs in the page's own realm
 * at document_start so it can wrap the page's `fetch` / `XMLHttpRequest` before the
 * app uses them, and passively read the GraphQL responses the app fetches — those
 * carry each video's real progressive mp4 URLs (`video_info.variants`). It forges
 * NO requests of its own; it only reads what the page already loaded, then posts
 * `[mediaId, mp4]` pairs to the isolated content script (which relays them to the
 * background). MAIN world can't use `chrome.*`, hence the postMessage bridge. The
 * fetch/XHR wiring is shared with the Instagram sniffer via installResponseSniffer.
 */
export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installResponseSniffer({
      urlKey: '__ibdUrl',
      isApi: (url) => /\/i\/api\/(?:graphql|2)\//.test(url),
      emit: makeSnifferEmit({
        guard: (text) => text.indexOf('video_info') !== -1,
        extract: extractVideoPairs,
        envelope: (pairs) => ({ source: 'ibd-x-media', pairs }),
      }),
    });
  },
});
