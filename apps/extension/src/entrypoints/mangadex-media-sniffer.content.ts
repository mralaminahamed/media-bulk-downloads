import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  extractMangadexMedia,
  chapterIdFromAtHomeUrl,
  MangadexMediaEntry,
  MANGADEX_MATCHES,
} from '@mbd/core/resolvers/sniffers/mangadex-media-sniff';
import { installResponseSniffer, installReplayOnReady } from '@mbd/core/resolvers/sniffers/response-sniffer';

/**
 * MAIN-world content script for MangaDex. Runs in the page realm at
 * document_start so it wraps `fetch` / `XMLHttpRequest` before the reader uses
 * them, and passively reads the `GET /at-home/server/<chapterId>` JSON the reader
 * fetches to render a chapter — each carries that chapter's page list (`baseUrl`
 * + `chapter.hash` + `data[]`). It forges NO requests; it only reads what the
 * page already loaded, keys each page to the chapter id from the request URL,
 * then postMessages the entries to the isolated content script. The chapter's
 * at-home response fires before the isolated relay registers, so entries are
 * buffered and replayed when the relay announces `mbd-mangadex-ready`.
 */
export default defineContentScript({
  matches: MANGADEX_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const buffer: MangadexMediaEntry[] = [];
    let relayReady = false;

    const emit = (text: string, url: string): void => {
      if (!text || text.indexOf('"baseUrl"') === -1) return;
      const chapterId = chapterIdFromAtHomeUrl(url);
      if (!chapterId) return;
      try {
        const entries = extractMangadexMedia(JSON.parse(text), chapterId);
        if (!entries.length) return;
        if (!relayReady) {
          for (const e of entries) buffer.push(e);
          if (buffer.length > 8000) buffer.splice(0, buffer.length - 8000);
        }
        window.postMessage({ source: 'mbd-mangadex-media', entries }, location.origin);
      } catch {
        /* not JSON / not ours — ignore, never disturb the page */
      }
    };

    installResponseSniffer({
      urlKey: '__mbdMdUrl',
      isApi: (url) => url.indexOf('/at-home/server/') !== -1,
      emit,
    });
    installReplayOnReady('mbd-mangadex-ready', () => {
      relayReady = true;
      if (buffer.length) window.postMessage({ source: 'mbd-mangadex-media', entries: buffer.splice(0) }, location.origin);
    });
  },
});
