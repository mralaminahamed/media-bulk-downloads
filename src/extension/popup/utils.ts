/**
 * Fetches the byte size of a remote image via a HEAD request.
 *
 * Runs from the popup (an extension-origin page), so host_permissions let it
 * bypass page CORS — unlike a content script. Returns 0 on any failure or when
 * the server omits Content-Length.
 */
export async function getImageFileSize(url: string): Promise<number> {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const length = response.headers.get('Content-Length');
        return length ? parseInt(length, 10) || 0 : 0;
    } catch {
        return 0;
    }
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
