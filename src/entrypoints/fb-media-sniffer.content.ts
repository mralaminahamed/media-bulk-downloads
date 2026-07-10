import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractFbMedia } from '@/extension/shared/resolvers/sniffers/fb-media-sniff';
import { installResponseSniffer, makeSnifferEmit } from '@/extension/shared/resolvers/sniffers/response-sniffer';

/**
 * MAIN-world content script for facebook.com. Runs at document_start so it wraps
 * the page's fetch/XHR before the app uses them, then passively reads the
 * /api/graphql responses FB fetches while the user scrolls/opens content — those
 * carry each photo/video's full media graph. Forges NO request; posts extracted
 * entries to the isolated content script. MAIN world can't use chrome.*, hence
 * the postMessage bridge; the fetch/XHR wiring is shared with the IG/X sniffers.
 */
export default defineContentScript({
  matches: ['*://*.facebook.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installResponseSniffer({
      urlKey: '__ibdFbUrl',
      isApi: (url) => url.indexOf('/api/graphql') !== -1 || url.indexOf('/graphql') !== -1,
      contentTypeOk: () => true,
      emit: makeSnifferEmit({
        guard: (text) =>
          text.indexOf('fbcdn') !== -1 || text.indexOf('playable_url') !== -1 || text.indexOf('progressive_url') !== -1,
        extract: extractFbMedia,
        envelope: (entries) => ({ source: 'ibd-fb-media', entries }),
        ndjson: true,
      }),
    });
  },
});
