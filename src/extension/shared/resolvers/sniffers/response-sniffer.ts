/**
 * Shared MAIN-world response sniffer used by the Instagram and X media sniffers.
 * Both run in the page's own realm at document_start, wrap `fetch` /
 * `XMLHttpRequest` to passively read the JSON the app already fetches, and post
 * the extracted media to the isolated content script. They differ ONLY in which
 * URLs count as API endpoints and how a response body is turned into a
 * postMessage — so that boilerplate lives here once. Uses no `chrome.*` (MAIN
 * world can't) and swallows every error so the page is never disturbed.
 */

export interface ResponseSnifferOptions {
  /** Which request URLs carry the media JSON. */
  isApi: (url: string) => boolean;
  /** Handle a JSON API response body (guard, parse, post). */
  emit: (text: string) => void;
  /** Property name used to stash the request URL on each XHR instance. */
  urlKey: string;
  /** Which response content-types carry the media graph. Default: any that
   *  includes "json". Facebook serves /api/graphql as `text/html`, so its
   *  sniffer overrides this to accept everything. */
  contentTypeOk?: (contentType: string) => boolean;
}

/** Wrap the page's fetch + XMLHttpRequest to feed JSON API response text to `emit`. */
export function installResponseSniffer({ isApi, emit, urlKey, contentTypeOk }: ResponseSnifferOptions): void {
  const ctOk = contentTypeOk ?? ((ct: string) => ct.includes('json'));
  const nativeFetch = window.fetch;
  window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
    const res = nativeFetch.apply(this as never, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input ?? '');
      if (isApi(url)) {
        res
          .then((r) => {
            if (ctOk(r.headers.get('content-type') || '')) r.clone().text().then(emit).catch(() => {});
          })
          .catch(() => {});
      }
    } catch {
      /* never disturb the page */
    }
    return res;
  } as typeof fetch;

  const XHR = XMLHttpRequest.prototype;
  const nativeOpen = XHR.open;
  const nativeSend = XHR.send;

  XHR.open = function patchedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    try {
      (this as unknown as Record<string, unknown>)[urlKey] = String(url);
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
          const url = String((this as unknown as Record<string, unknown>)[urlKey] || '');
          const ct = this.getResponseHeader('content-type') || '';
          if (isApi(url) && ctOk(ct) && typeof this.responseText === 'string') emit(this.responseText);
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
}

export interface UrlSnifferOptions {
  /** Which request URLs to report (absolute-resolved before this is called). */
  isMatch: (url: string) => boolean;
  /** Called with each matching absolute request URL. */
  onUrl: (url: string) => void;
}

/**
 * Wrap the page's fetch + XMLHttpRequest.open to observe request URLs (not
 * bodies) — for detecting resources the app requests, e.g. an HLS `.m3u8`
 * manifest fetched by hls.js. Reports at request time (so a slow/failed response
 * doesn't hide the URL), resolves relative URLs against the page, and swallows
 * every error so the page is never disturbed.
 */
export function installUrlSniffer({ isMatch, onUrl }: UrlSnifferOptions): void {
  const report = (raw: string | undefined): void => {
    try {
      if (!raw) return;
      const abs = new URL(raw, location.href).href;
      if (isMatch(abs)) onUrl(abs);
    } catch {
      /* not a URL / ignore */
    }
  };

  const nativeFetch = window.fetch;
  window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
    try {
      const input = args[0];
      report(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input ?? ''));
    } catch {
      /* never disturb the page */
    }
    return nativeFetch.apply(this as never, args);
  } as typeof fetch;

  const XHR = XMLHttpRequest.prototype;
  const nativeOpen = XHR.open;
  XHR.open = function patchedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    try {
      report(String(url));
    } catch {
      /* ignore */
    }
    // @ts-expect-error — forward the native signature verbatim
    return nativeOpen.call(this, method, url, ...rest);
  };
}

/**
 * Register a replay trigger for a MAIN-world sniffer. The isolated relay that
 * consumes a sniffer's postMessages only starts listening at `document_idle`
 * (after its async import), so anything the sniffer posted earlier is lost. When
 * the relay announces itself by posting `{ source: readySource }`, run `replay`
 * (which re-posts everything seen so far). The envelope is validated to the same
 * window + origin, matching the relay's own guard.
 */
export function installReplayOnReady(readySource: string, replay: () => void): void {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if ((e.data as { source?: unknown } | null)?.source === readySource) replay();
  });
}

export interface EmitOptions<T> {
  /** Cheap substring gate applied before the (costly) JSON parse + deep walk. */
  guard: (text: string) => boolean;
  /** Parse the response JSON into media items. */
  extract: (json: unknown) => T[];
  /** Wrap the items in the postMessage envelope the content-script relay expects. */
  envelope: (items: T[]) => object;
}

/**
 * Build an `emit(text)` that guards on a cheap substring, parses + extracts, and
 * postMessages the envelope to the isolated content script (same-origin only).
 * Non-JSON or unexpected shapes are ignored.
 */
export function makeSnifferEmit<T>({ guard, extract, envelope }: EmitOptions<T>): (text: string) => void {
  return (text: string): void => {
    if (!text || !guard(text)) return;
    try {
      const items = extract(JSON.parse(text));
      if (items.length) window.postMessage(envelope(items), location.origin);
    } catch {
      /* not JSON / not ours — ignore, never disturb the page */
    }
  };
}
