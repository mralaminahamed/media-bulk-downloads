import { ProbeMediaMetaResponse } from '@mbd/core/types';

/**
 * Asks the background for each item's real size and content type (a HEAD, or a
 * one-byte ranged GET). Explicit and user-initiated — collection never probes.
 * Resolves to an empty map on error.
 */
export async function requestMediaMeta(
  srcs: string[],
): Promise<ProbeMediaMetaResponse['meta']> {
  if (!srcs.length) return {};
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'PROBE_MEDIA_META', srcs }, (resp: ProbeMediaMetaResponse) => {
      if (chrome.runtime.lastError || !resp) return resolve({});
      resolve(resp.meta || {});
    });
  });
}
