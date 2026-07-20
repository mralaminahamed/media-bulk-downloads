import { isSafeCaptureUrl } from '@mbd/core/download/stream/ssrf-guard';

/**
 * Fetches the byte size of a remote image via a HEAD request.
 *
 * Runs from the popup (an extension-origin page), so host_permissions let it
 * bypass page CORS — unlike a content script. Returns 0 on any failure or when
 * the server omits Content-Length.
 *
 * `url` is a page-controlled `img.src`, and this fires automatically for every
 * collected image (enrichImageSizes, on every popup open) — without a guard, a
 * hostile page could aim the HEAD at an internal/loopback/link-local host (e.g.
 * cloud metadata at 169.254.169.254). Refuse those up front, same as zip.ts.
 */
export async function getImageFileSize(url: string): Promise<number> {
    if (!isSafeCaptureUrl(url)) return 0;
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const length = response.headers.get('Content-Length');
        return length ? parseInt(length, 10) || 0 : 0;
    } catch {
        return 0;
    }
}

/**
 * Fetches a remote image's raw bytes. Like getImageFileSize, this runs from the
 * popup (an extension-origin page), so host_permissions bypass page CORS. Returns
 * null on any failure or abort — callers skip that item rather than fail the batch.
 * Used by the perceptual-hash near-duplicate pass (#198) to feed bytes to its worker.
 *
 * Same SSRF exposure as getImageFileSize: `url` is page-controlled, so refuse a
 * disallowed host before ever calling fetch.
 */
export async function fetchImageBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    if (!isSafeCaptureUrl(url)) return null;
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) return null;
        return await response.arrayBuffer();
    } catch {
        return null;
    }
}

/**
 * Fire-and-forget runtime message: reads any rejection so a momentarily-asleep
 * background worker doesn't surface an "Unchecked runtime.lastError" in the console.
 * Use for messages whose response we don't consume.
 */
export function sendRuntimeMessage(message: unknown): void {
    const result = chrome.runtime.sendMessage(message) as Promise<unknown> | undefined;
    if (result && typeof result.then === 'function') {
        result.catch(() => {
            /* no receiver / background asleep */
        });
    }
}

/** Copy text to the clipboard; returns whether it succeeded. */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Save a text payload as a file. Routed through the background (DOWNLOAD_TEXT) so
 * it works from the on-page bubble too, which has no chrome.downloads.
 */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
    sendRuntimeMessage({ type: 'DOWNLOAD_TEXT', filename, text, mime });
}

/**
 * The set of media srcs already downloaded whose file still exists on disk.
 * Routed through the background (DOWNLOADED_SRCS) because chrome.downloads is
 * unavailable to the on-page bubble's content script. Resolves to an empty set
 * if the worker is asleep / gives no answer, so the UI just shows nothing as
 * downloaded rather than breaking.
 */
export function fetchDownloadedOnDisk(): Promise<Set<string>> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_DOWNLOADED_SRCS' }, (srcs?: string[]) => {
        void chrome.runtime.lastError;
        resolve(new Set(Array.isArray(srcs) ? srcs : []));
      });
    } catch {
      resolve(new Set());
    }
  });
}

/** Compact relative time: "now", "5m", "3h", "2d", else a date. */
export function relativeTime(ms: number): string {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 604800) return `${Math.floor(s / 86400)}d`;
    return new Date(ms).toLocaleDateString();
}

/**
 * Runs an async mapper over items with a bounded number of concurrent tasks,
 * so enriching many images doesn't fire hundreds of simultaneous requests.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await fn(items[index], index);
        }
    };

    const workerCount = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: workerCount }, worker));

    return results;
}
