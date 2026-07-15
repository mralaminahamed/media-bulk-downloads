import { DashDeps } from '@mbd/core/download/stream/dash';
import { retryingFetch, FETCH_TIMEOUT_MS } from '@mbd/core/net/retry';
import { readBounded, readBoundedText } from '@mbd/core/download/stream/bounded-fetch';

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
// A bounded per-attempt timeout: a slow/unresponsive PUBLIC host that accepts
// the TCP connection but never responds would otherwise hang this fetch
// forever (assertSafeCaptureUrl only screens internal/private hosts) — see
// FETCH_TIMEOUT_MS's doc comment in net/retry.ts.
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
