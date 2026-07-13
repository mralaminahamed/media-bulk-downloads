import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractFbMedia, FbMediaEntry } from '@mbd/core/resolvers/sniffers/fb-media-sniff';
import { installResponseSniffer, makeSnifferEmit, installReplayOnReady } from '@mbd/core/resolvers/sniffers/response-sniffer';

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
    // This sniffer wraps XHR at document_start, but the isolated relay that
    // ingests these posts only registers at document_idle. The /api/graphql FB
    // streams in that gap (initial load — the above-fold photos) would be posted
    // to a relay that isn't listening yet and lost. So buffer every entry emitted
    // before the relay is ready, and replay it when the relay announces itself
    // (ingestSniffedFbMedia dedups by fbid + keeps the largest, so re-posting is
    // safe). After ready, live posts suffice, so nothing more is buffered.
    const buffer: FbMediaEntry[] = [];
    let relayReady = false;
    installResponseSniffer({
      urlKey: '__ibdFbUrl',
      isApi: (url) => url.indexOf('/api/graphql') !== -1 || url.indexOf('/graphql') !== -1,
      contentTypeOk: () => true,
      emit: makeSnifferEmit({
        guard: (text) =>
          text.indexOf('fbcdn') !== -1 || text.indexOf('playable_url') !== -1 || text.indexOf('progressive_url') !== -1,
        extract: extractFbMedia,
        envelope: (entries) => {
          if (!relayReady) {
            buffer.push(...entries);
            // If the isolated relay never readies (its content script failed to run,
            // was blocked, or threw before the FB branch), FB's SPA keeps streaming
            // for the whole session — cap the bridge buffer so it can't leak the
            // page's heap without bound. Mirrors the Pinterest sniffer. Newest wins.
            if (buffer.length > 8000) buffer.splice(0, buffer.length - 8000);
          }
          return { source: 'ibd-fb-media', entries };
        },
        ndjson: true,
      }),
    });
    installReplayOnReady('ibd-fb-ready', () => {
      relayReady = true;
      if (buffer.length) window.postMessage({ source: 'ibd-fb-media', entries: buffer.splice(0) }, location.origin);
    });
  },
});
