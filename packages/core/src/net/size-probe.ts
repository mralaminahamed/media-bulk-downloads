/**
 * Ask a CDN how big a media file is, and what it really is, without downloading
 * it — a `HEAD`, falling back to a one-byte ranged `GET` for the many CDNs that
 * reject `HEAD`.
 *
 * Collection can't know either fact: `ImageInfo.fileSize` is 0 for everything
 * except a data: URI, so the size column, the size sort and any size-based
 * filtering are inert for remote media; and a URL with no extension
 * (`/render?id=1`) yields `type: 'unknown'`, which the download names `.jpg`
 * whatever the bytes actually are. One cheap request per item fixes both.
 *
 * This is the only place in @mbd/core that issues a request for a COLLECTED
 * item, so it is opt-in at every call site and SSRF-guarded here rather than
 * trusting the caller.
 */
import { assertSafeCaptureUrl } from '@mbd/core/download/stream/ssrf-guard';
import { normalizeImageFormat } from '@mbd/core/collection/media-formats';

export interface MediaMeta {
  /** Whether the server served the URL at all — a false here is a dead link. */
  ok: boolean;
  /** Total size in bytes, when the server reported one. */
  bytes?: number;
  /** Canonical media type from the response Content-Type, when it names one. */
  type?: string;
}

export interface ProbeDeps {
  fetch: typeof fetch;
  /** Per-request timeout. Default 10s — a probe must never outlive the user's
   *  patience the way a download can. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const FAILED: MediaMeta = { ok: false };

function positiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : undefined;
}

/** `bytes 0-0/987654` → 987654. `*` (unknown total) yields undefined. */
function totalFromContentRange(raw: string | null): number | undefined {
  const m = raw ? /\/\s*(\d+)\s*$/.exec(raw) : null;
  return m ? positiveInt(m[1]) : undefined;
}

function typeFromContentType(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const m = /^\s*(image|video|audio)\/([\w.+-]+)/i.exec(raw);
  if (!m) return undefined;
  if (m[1].toLowerCase() === 'image') {
    const t = normalizeImageFormat(m[2]);
    return t === 'unknown' ? undefined : t;
  }
  return m[2].toLowerCase();
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Size + real type for one media URL. Never throws: an unreachable, blocked or
 *  malformed URL resolves to `{ ok: false }`. */
export async function probeMediaMeta(url: string, deps: ProbeDeps): Promise<MediaMeta> {
  if (!/^https?:\/\//i.test(url)) return FAILED;
  try {
    assertSafeCaptureUrl(url);
  } catch {
    return FAILED;
  }
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let head: Response | undefined;
  try {
    // redirect:'error' — assertSafeCaptureUrl only vetted the initial URL; without
    // this a public URL could 30x into an internal host (SSRF), mirroring the
    // guard fetchBytes uses in zip.ts.
    head = await withTimeout((signal) => deps.fetch(url, { method: 'HEAD', redirect: 'error', signal }), timeoutMs);
  } catch {
    head = undefined;
  }

  if (head?.ok) {
    const meta: MediaMeta = { ok: true };
    const bytes = positiveInt(head.headers.get('content-length'));
    if (bytes !== undefined) meta.bytes = bytes;
    const type = typeFromContentType(head.headers.get('content-type'));
    if (type !== undefined) meta.type = type;
    return meta;
  }

  // Plenty of CDNs answer HEAD with 405/501 (or drop it) while serving ranges
  // fine, so a rejected HEAD is not yet an answer about the URL.
  let ranged: Response | undefined;
  try {
    ranged = await withTimeout(
      (signal) => deps.fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'error', signal }),
      timeoutMs,
    );
  } catch {
    return FAILED;
  }
  if (!ranged.ok) return FAILED;

  const meta: MediaMeta = { ok: true };
  const bytes =
    totalFromContentRange(ranged.headers.get('content-range')) ??
    // A server that ignored the Range header answered 200 with the whole file.
    (ranged.status === 200 ? positiveInt(ranged.headers.get('content-length')) : undefined);
  if (bytes !== undefined) meta.bytes = bytes;
  const type = typeFromContentType(ranged.headers.get('content-type'));
  if (type !== undefined) meta.type = type;
  return meta;
}

/** Probe many URLs with a bounded number in flight, keyed by URL. One failure
 *  never sinks the batch. */
export async function probeMediaMetaBatch(
  urls: readonly string[],
  deps: ProbeDeps,
  concurrency = 4,
): Promise<Record<string, MediaMeta>> {
  const out: Record<string, MediaMeta> = {};
  const cap = Math.max(1, Math.floor(concurrency));
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      const url = urls[i];
      out[url] = await probeMediaMeta(url, deps).catch(() => FAILED);
    }
  };

  await Promise.all(Array.from({ length: Math.min(cap, urls.length) }, worker));
  return out;
}
