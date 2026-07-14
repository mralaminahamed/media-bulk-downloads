/**
 * In-content store of HLS/DASH manifest URLs seen by the MAIN-world `hls-sniffer`
 * (which wraps the page's fetch/XHR to catch `.m3u8`/`.mpd` requests hls.js,
 * dash.js, and native players make). The sniffer can't use `chrome.*`, so it
 * postMessages the URLs to the isolated content script, which feeds them here;
 * `collectMedia()` then reads `sniffedHlsManifests()` and surfaces each as a
 * capturable stream.
 *
 * The payload crosses the MAIN→isolated postMessage boundary, so it is UNTRUSTED:
 * any page can forge the envelope. Re-validate here — only http(s) `.m3u8`/`.mpd`
 * URLs are stored (the same class the DOM path already surfaces on user click),
 * capped to bound memory on long-lived SPA sessions.
 */

import { isHlsManifest, isDashManifest } from '@mbd/core/collection/mediaType';

const CAP = 500;
const manifests = new Set<string>();

/** Feed sniffed manifest URLs (an array crossing the page realm) into the store. */
export function ingestSniffedHls(urls: unknown): void {
  if (!Array.isArray(urls)) return;
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    if (!/^https?:\/\//i.test(raw) || !(isHlsManifest(raw) || isDashManifest(raw))) continue;
    // Re-inserting refreshes recency (Set keeps first-insert order, so delete first).
    if (manifests.has(raw)) manifests.delete(raw);
    manifests.add(raw);
    if (manifests.size > CAP) manifests.delete(manifests.values().next().value as string);
  }
}

/** The manifest URLs seen so far (newest last). */
export function sniffedHlsManifests(): string[] {
  return [...manifests];
}

/** Test-only: clear the store between cases. */
export function resetSniffedHls(): void {
  manifests.clear();
}
