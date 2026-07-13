import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractIgMedia } from '@mbd/core/resolvers/sniffers/ig-media-sniff';
import { installResponseSniffer, makeSnifferEmit } from '@mbd/core/resolvers/sniffers/response-sniffer';

/**
 * MAIN-world content script for instagram.com. Runs in the page's own realm at
 * document_start so it can wrap the page's `fetch` / `XMLHttpRequest` before the
 * app uses them, and passively read the GraphQL / `/api/v1/` responses the app
 * fetches while the user scrolls — those carry each post's full media graph
 * (`image_versions2.candidates`, `video_versions`) for posts loaded after the
 * initial HTML. It forges NO requests of its own; it only reads what the page
 * already loaded, then posts the extracted media entries to the isolated content
 * script (which feeds them to the resolver). MAIN world can't use `chrome.*`,
 * hence the postMessage bridge. The fetch/XHR wiring is shared with the X sniffer
 * via installResponseSniffer.
 */
export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installResponseSniffer({
      urlKey: '__ibdIgUrl',
      isApi: (url) => url.indexOf('/api/v1/') !== -1 || url.indexOf('/graphql') !== -1,
      emit: makeSnifferEmit({
        guard: (text) => text.indexOf('image_versions2') !== -1 || text.indexOf('video_versions') !== -1,
        extract: extractIgMedia,
        envelope: (entries) => ({ source: 'ibd-ig-media', entries }),
      }),
    });
  },
});
