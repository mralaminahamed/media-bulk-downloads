import { DashDeps } from './dash';
import { retryingFetch } from '@mbd/core/net/retry';

/**
 * DASH engine deps backed by the browser: an extension page's CORS-free `fetch`
 * (offscreen doc with <all_urls>). No decrypt — clear DASH only; encrypted DASH is
 * refused by the engine (`drm`). Mirrors `browserHlsDeps` minus the range/decrypt.
 */

// Retry transient segment/manifest failures so one flaky fetch doesn't abort the
// whole capture. Bound closure: the global fetch must not be invoked unbound.
//
// `redirect: 'error'` closes an SSRF-guard bypass (see browserHlsDeps): the guard
// checks only the pre-fetch URL, so following a redirect could GET an internal
// host from this <all_urls> context. Failing the redirect prevents that request.
const netFetch = retryingFetch((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  fetch(url, { ...init, redirect: 'error' }));

export function browserDashDeps(onProgress?: (done: number, total: number) => void): DashDeps {
  return {
    fetchText: async (url) => {
      const res = await netFetch(url);
      if (!res.ok) throw new Error(`Manifest fetch failed (${res.status}).`);
      return res.text();
    },
    fetchBytes: async (url) => {
      const res = await netFetch(url);
      if (!res.ok) throw new Error(`Segment fetch failed (${res.status}).`);
      return new Uint8Array(await res.arrayBuffer());
    },
    concurrency: 6,
    onProgress,
  };
}
