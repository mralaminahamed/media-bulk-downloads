import { DashDeps } from '@mbd/core/download/stream/dash';
import { retryingFetch, FETCH_TIMEOUT_MS } from '@mbd/core/net/retry';
import { readBounded, readBoundedText } from '@mbd/core/download/stream/bounded-fetch';

/**
 * DASH engine deps backed by the browser: an extension page's CORS-free `fetch`
 * (offscreen doc with <all_urls>). No decrypt — clear DASH only; encrypted DASH is
 * refused by the engine (`drm`). Mirrors `browserHlsDeps` minus the range/decrypt.
 */

const netFetch = retryingFetch((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  fetch(url, { ...init, redirect: 'error' }), { timeoutMs: FETCH_TIMEOUT_MS });

export function browserDashDeps(onProgress?: (done: number, total: number) => void): DashDeps {
  return {
    fetchText: async (url) => {
      const res = await netFetch(url);
      if (!res.ok) throw new Error(`Manifest fetch failed (${res.status}).`);
      return readBoundedText(res);
    },
    fetchBytes: async (url) => {
      const res = await netFetch(url);
      if (!res.ok) throw new Error(`Segment fetch failed (${res.status}).`);
      return readBounded(res);
    },
    concurrency: 6,
    onProgress,
  };
}
