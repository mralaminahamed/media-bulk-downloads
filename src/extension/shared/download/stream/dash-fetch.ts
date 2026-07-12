import { DashDeps } from './dash';
import { retryingFetch } from '@/extension/shared/net/retry';

/**
 * DASH engine deps backed by the browser: an extension page's CORS-free `fetch`
 * (offscreen doc with <all_urls>). No decrypt — clear DASH only; encrypted DASH is
 * refused by the engine (`drm`). Mirrors `browserHlsDeps` minus the range/decrypt.
 */

// Retry transient segment/manifest failures so one flaky fetch doesn't abort the
// whole capture. Bound closure: the global fetch must not be invoked unbound.
const netFetch = retryingFetch((...args: Parameters<typeof fetch>) => fetch(...args));

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
