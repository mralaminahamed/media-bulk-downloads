import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractVideoPairs } from '@/extension/shared/x-media-sniff';

/**
 * MAIN-world content script for x.com / twitter.com. Runs in the page's own realm
 * at document_start so it can wrap the page's `fetch` / `XMLHttpRequest` before the
 * app uses them, and passively read the GraphQL responses the app fetches — those
 * carry each video's real progressive mp4 URLs (`video_info.variants`). It forges
 * NO requests of its own; it only reads what the page already loaded, then posts
 * `[mediaId, mp4]` pairs to the isolated content script (which relays them to the
 * background). MAIN world can't use `chrome.*`, hence the postMessage bridge.
 */
export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const isApi = (url: string): boolean => /\/i\/api\/(?:graphql|2)\//.test(url);

    const emit = (text: string): void => {
      // Cheap guard: skip the JSON parse + deep-walk unless a video is present.
      if (!text || text.indexOf('video_info') === -1) return;
      try {
        const pairs = extractVideoPairs(JSON.parse(text));
        if (pairs.length) window.postMessage({ source: 'ibd-x-media', pairs }, location.origin);
      } catch {
        /* not JSON / not ours — ignore, never disturb the page */
      }
    };

    // --- fetch ---
    const nativeFetch = window.fetch;
    window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
      const res = nativeFetch.apply(this as never, args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input ?? '');
        if (isApi(url)) {
          res
            .then((r) => {
              if ((r.headers.get('content-type') || '').includes('json')) r.clone().text().then(emit).catch(() => {});
            })
            .catch(() => {});
        }
      } catch {
        /* never disturb the page */
      }
      return res;
    } as typeof fetch;

    // --- XMLHttpRequest ---
    const XHR = XMLHttpRequest.prototype;
    const nativeOpen = XHR.open;
    const nativeSend = XHR.send;
    const URL_KEY = '__ibdUrl';

    XHR.open = function patchedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      try {
        (this as unknown as Record<string, unknown>)[URL_KEY] = String(url);
      } catch {
        /* ignore */
      }
      // @ts-expect-error — forward the native signature verbatim
      return nativeOpen.call(this, method, url, ...rest);
    };

    XHR.send = function patchedSend(this: XMLHttpRequest, ...args: unknown[]) {
      try {
        this.addEventListener('load', () => {
          try {
            const url = String((this as unknown as Record<string, unknown>)[URL_KEY] || '');
            const ct = this.getResponseHeader('content-type') || '';
            if (isApi(url) && ct.includes('json') && typeof this.responseText === 'string') emit(this.responseText);
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
      // @ts-expect-error — forward the native signature verbatim
      return nativeSend.apply(this, args);
    };
  },
});
