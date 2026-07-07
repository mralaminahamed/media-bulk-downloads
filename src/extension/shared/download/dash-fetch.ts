import { DashDeps } from './dash';

/**
 * DASH engine deps backed by the browser: an extension page's CORS-free `fetch`
 * (offscreen doc with <all_urls>). No decrypt — clear DASH only; encrypted DASH is
 * refused by the engine (`drm`). Mirrors `browserHlsDeps` minus the range/decrypt.
 */
export function browserDashDeps(onProgress?: (done: number, total: number) => void): DashDeps {
  return {
    fetchText: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Manifest fetch failed (${res.status}).`);
      return res.text();
    },
    fetchBytes: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Segment fetch failed (${res.status}).`);
      return new Uint8Array(await res.arrayBuffer());
    },
    concurrency: 6,
    onProgress,
  };
}
