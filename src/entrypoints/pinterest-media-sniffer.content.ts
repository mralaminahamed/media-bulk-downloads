import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractPinterestMedia, PinterestMediaEntry } from '@/extension/shared/resolvers/sniffers/pinterest-media-sniff';
import { installResponseSniffer, makeSnifferEmit, installReplayOnReady } from '@/extension/shared/resolvers/sniffers/response-sniffer';
import { PINTEREST_MATCHES } from '@/extension/shared/resolvers/sniffers/pinterest-hosts';

/**
 * MAIN-world content script for Pinterest. Runs in the page realm at
 * document_start so it wraps `fetch` / `XMLHttpRequest` before the app uses them,
 * and passively reads the `/resource/<Name>/get/` JSON the app fetches while the
 * user scrolls — each carries a feed page of pins (`images` size map, `videos.
 * video_list`). It forges NO requests; it only reads what the page already loaded,
 * then postMessages the extracted entries to the isolated content script. The
 * initial feed response fires before the isolated relay registers, so entries are
 * buffered and replayed when the relay announces `ibd-pinterest-ready`.
 */
export default defineContentScript({
  matches: PINTEREST_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const buffer: PinterestMediaEntry[] = [];
    const emit = makeSnifferEmit<PinterestMediaEntry>({
      guard: (text) => text.indexOf('"images"') !== -1 || text.indexOf('video_list') !== -1,
      extract: extractPinterestMedia,
      envelope: (entries) => {
        buffer.push(...entries);
        if (buffer.length > 8000) buffer.splice(0, buffer.length - 8000);
        return { source: 'ibd-pinterest-media', entries };
      },
    });
    installResponseSniffer({
      urlKey: '__ibdPinUrl',
      isApi: (url) => url.indexOf('/resource/') !== -1 && url.indexOf('/get/') !== -1,
      emit,
    });
    // Replay everything buffered so far when the isolated relay says it is ready.
    installReplayOnReady('ibd-pinterest-ready', () => {
      if (buffer.length) window.postMessage({ source: 'ibd-pinterest-media', entries: buffer.slice() }, location.origin);
    });
  },
});
