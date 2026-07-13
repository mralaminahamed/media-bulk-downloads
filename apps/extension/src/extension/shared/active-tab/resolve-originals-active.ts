import { ResolveHint, ResolvedMedia, ResolveOriginalsResponse } from '@mbd/core/types';

/**
 * Asks the background to resolve original media URLs for the given hints
 * (opt-in, network-fetching resolution). Resolves to an empty map on error
 * or when there's nothing to resolve.
 */
export async function requestResolveOriginals(
  targets: { src: string; hint: ResolveHint }[],
): Promise<Record<string, ResolvedMedia>> {
  if (!targets.length) return {};
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'RESOLVE_ORIGINALS', hints: targets }, (resp: ResolveOriginalsResponse) => {
      if (chrome.runtime.lastError || !resp) return resolve({});
      resolve(resp.resolved || {});
    });
  });
}
