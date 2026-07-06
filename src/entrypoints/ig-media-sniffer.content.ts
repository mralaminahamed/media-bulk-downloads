import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractIgMedia } from '@/extension/shared/ig-media-sniff';

/**
 * MAIN-world content script for instagram.com. Runs in the page's own realm at
 * document_start so it can wrap the page's `fetch` / `XMLHttpRequest` before the
 * app uses them, and passively read the GraphQL / `/api/v1/` responses the app
 * fetches while the user scrolls — those carry each post's full media graph
 * (`image_versions2.candidates`, `video_versions`) for posts loaded after the
 * initial HTML. It forges NO requests of its own; it only reads what the page
 * already loaded, then posts the extracted media entries to the isolated content
 * script (which feeds them to the resolver). MAIN world can't use `chrome.*`,
 * hence the postMessage bridge.
 */
export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const isApi = (url: string): boolean => url.indexOf('/api/v1/') !== -1 || url.indexOf('/graphql') !== -1;

    const emit = (text: string): void => {
      // Cheap guard: skip the JSON parse + deep-walk unless media is present.
      if (!text || (text.indexOf('image_versions2') === -1 && text.indexOf('video_versions') === -1)) return;
      try {
        const entries = extractIgMedia(JSON.parse(text));
        if (entries.length) window.postMessage({ source: 'ibd-ig-media', entries }, location.origin);
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
    const URL_KEY = '__ibdIgUrl';

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
