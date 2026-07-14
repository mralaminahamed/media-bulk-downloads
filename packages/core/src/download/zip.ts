import { zipSync } from 'fflate';
import { ImageInfo, SettingsData } from '@mbd/core/types';
import { buildDownloadFilename } from '@mbd/core/collection/download-name';
import { hostFromUrl, registrableDomain, sanitizePathSegment, todayISO } from '@mbd/core/collection/paths';
import { buildMediaSidecar, serializeSidecar, sidecarName } from '@mbd/core/download/metadata-sidecar';
import { isSafeCaptureUrl } from '@mbd/core/download/stream/ssrf-guard';

/**
 * Builds a single ZIP archive from collected media, run in the popup/bubble
 * React context (both are extension pages with `<all_urls>` host permission, so
 * their `fetch` bypasses page CORS). Each item's bytes are fetched and stored
 * under the SAME folder/name it would get as an individual download, so
 * unzipping reproduces the user's configured layout. Fetch failures (a CDN that
 * 403s a hotlink, a network error) don't abort the archive — the item is
 * reported in `failed` so the caller can fall back to an individual download.
 */

export interface ZipItemResult {
  src: string;
  /** Path assigned inside the archive; empty when the fetch failed. */
  path: string;
  ok: boolean;
}

export interface ZipResult {
  /** The archive bytes; empty (length 0) when nothing could be fetched. */
  bytes: Uint8Array;
  /** How many items were fetched and added. */
  ok: number;
  results: ZipItemResult[];
  /** Items whose bytes couldn't be fetched — candidates for individual download. */
  failed: ImageInfo[];
}

/** Total in-memory bytes buildZip will accumulate before archiving. Mirrors the
 *  stream-capture ceiling (STREAM_MAX_BYTES) so a huge selection can't exhaust the
 *  popup/bubble page's memory and lose the whole batch — items past the cap are
 *  reported in `failed` for individual download instead. */
export const ZIP_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

export interface ZipDeps {
  /** Injectable so tests don't hit the network. */
  fetch: typeof fetch;
  /** Bounded parallel fetches (default 6). */
  concurrency?: number;
  /** Aggregate in-memory byte ceiling (default ZIP_MAX_BYTES); injectable for tests. */
  maxBytes?: number;
  onProgress?: (done: number, total: number) => void;
  /** ISO timestamp for the metadata sidecars (#284); injectable for deterministic
   *  tests. Defaults to now. Only used when `settings.metadataSidecar` is on. */
  capturedAt?: string;
}

/**
 * Ensures each archive path is unique. Two items can resolve to the same name
 * (e.g. `namingMode: 'original'` with two `photo.jpg`s) — a ZIP with duplicate
 * paths silently drops all but one, so append ` (n)` before the extension.
 */
function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  let candidate = `${dir}${stem} (${n})${ext}`;
  while (used.has(candidate)) candidate = `${dir}${stem} (${++n})${ext}`;
  used.add(candidate);
  return candidate;
}

/**
 * Fetch a URL's bytes, or null on any failure (blocked host, non-ok status,
 * network, empty). This fetch runs with the popup/bubble's `<all_urls>` grant
 * and bypasses CORS, so a page-controlled media `src` is an SSRF vector — the
 * same one the stream-capture engines guard against. Refuse a disallowed host
 * up front, and refuse redirects so a public URL can't 30x into an internal one.
 * A blocked item returns null and lands in `failed` like any other fetch miss.
 */
async function fetchBytes(url: string, doFetch: typeof fetch, maxBytes?: number): Promise<Uint8Array | null> {
  if (!isSafeCaptureUrl(url)) return null;
  try {
    const res = await doFetch(url, { redirect: 'error' });
    if (!res.ok) return null;
    // Skip an item the server declares is larger than the remaining budget BEFORE
    // buffering it: arrayBuffer() materializes the entire body in the popup/bubble
    // heap, and with several concurrent workers a few large items can OOM the page
    // before the post-buffer cap check can intervene. A body with no (or an
    // unparseable) content-length still buffers and is bounded by that later check.
    const declared = Number(res.headers?.get?.('content-length'));
    if (maxBytes != null && Number.isFinite(declared) && declared > maxBytes) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 0 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

export async function buildZip(
  images: ImageInfo[],
  settings: SettingsData,
  sourcePageUrl: string | undefined,
  deps: ZipDeps,
): Promise<ZipResult> {
  const used = new Set<string>();
  // Assign a stable internal path per image up front — index-based names keep
  // the original order; uniquePath resolves any 'original'-mode collisions.
  const planned = images.map((image, index) => ({
    image,
    path: uniquePath(buildDownloadFilename(image, index, settings, sourcePageUrl), used),
  }));

  const files: Record<string, Uint8Array> = {};
  const results: ZipItemResult[] = new Array(planned.length);
  const failed: ImageInfo[] = [];
  const limit = Math.max(1, deps.concurrency ?? 6);
  const cap = deps.maxBytes ?? ZIP_MAX_BYTES;
  // #284: a sibling `<name>.json` beside each fetched item, in the same folder.
  const capturedAt = deps.capturedAt ?? new Date().toISOString();
  const encoder = new TextEncoder();
  let done = 0;
  let cursor = 0;
  // Running total of media bytes already committed to `files`. Once an item would
  // push it past `cap`, stop admitting items (`full`) — the rest are reported in
  // `failed` for individual download, yielding a partial archive rather than an OOM.
  let totalBytes = 0;
  let full = false;

  async function worker(): Promise<void> {
    while (cursor < planned.length) {
      const i = cursor++;
      const { image, path } = planned[i];
      // Once the cap is hit, skip the fetch entirely for remaining items. Pass the
      // remaining budget so an item that declares a size past it is skipped before
      // its body is buffered (see fetchBytes).
      const bytes = full ? null : await fetchBytes(image.src, deps.fetch, cap - totalBytes);
      if (bytes && totalBytes + bytes.length <= cap) {
        totalBytes += bytes.length;
        files[path] = bytes;
        if (settings.metadataSidecar) {
          files[sidecarName(path)] = encoder.encode(
            serializeSidecar(buildMediaSidecar(image, { url: sourcePageUrl }, capturedAt)),
          );
        }
        results[i] = { src: image.src, path, ok: true };
      } else {
        // A fetched item that would breach the cap trips `full` so no further
        // bytes are pulled into memory; a plain fetch miss (bytes === null) doesn't.
        if (bytes) full = true;
        results[i] = { src: image.src, path: '', ok: false };
        failed.push(image);
      }
      deps.onProgress?.(++done, planned.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, planned.length) }, worker));

  const ok = results.filter((r) => r.ok).length;
  // level 0 = store. Media (jpg/png/webp/mp4) is already compressed, so
  // deflating wastes CPU for ~no size gain; storing is fast and deterministic.
  const bytes = ok > 0 ? zipSync(files, { level: 0 }) : new Uint8Array(0);
  return { bytes, ok, results, failed };
}

/**
 * Archive filename for a download batch, e.g. `twitter.com-media-2026-07-06.zip`.
 * `date` is injectable for deterministic tests (defaults to today, local time).
 */
export function zipFileName(sourcePageUrl?: string, date: string = todayISO()): string {
  const domain = registrableDomain(hostFromUrl(sourcePageUrl));
  const base = domain ? `${domain}-media` : 'media';
  return `${sanitizePathSegment(`${base}-${date}`)}.zip`;
}
