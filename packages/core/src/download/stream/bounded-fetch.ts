import { STREAM_MAX_BYTES } from '@mbd/core/download/stream/capture-constants';

/**
 * Reading a capture fetch's body incrementally with a hard byte ceiling, so a
 * hostile HLS/DASH manifest that names one segment/init/key/manifest URL resolving
 * to a multi-gigabyte or endless (chunked, no Content-Length) response can't fully
 * materialize into memory and OOM the offscreen document BEFORE the engine's
 * cumulative budget is ever consulted (I17). The cap is the absolute per-response
 * ceiling — no single response of a legitimate capture approaches it.
 */

/** Thrown when a single response exceeds the per-response byte ceiling. */
export class StreamTooLargeError extends Error {
  constructor() {
    super('Stream exceeds the maximum capture size.');
    this.name = 'StreamTooLargeError';
  }
}

/**
 * Read a Response body to bytes, aborting once it exceeds `max`. Streams via
 * `body.getReader()` when available so an oversized/endless response is stopped
 * mid-flight; falls back to `arrayBuffer()` (still size-checked) when the body is
 * not a readable stream (a mocked fetch, or an engine without streaming bodies).
 */
export async function readBounded(res: Response, max = STREAM_MAX_BYTES): Promise<Uint8Array> {
  const body = res.body as ReadableStream<Uint8Array> | null;
  if (!body || typeof body.getReader !== 'function') {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > max) throw new StreamTooLargeError();
    return bytes;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        throw new StreamTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** As {@link readBounded}, decoded to text — for the (also unbounded) manifest fetch.
 *  A degenerate Response with neither a streamable body nor `arrayBuffer` (only
 *  `text()`) can't be size-bounded; a real fetch Response always has `arrayBuffer`,
 *  so this fallback never disables the ceiling in production. */
export async function readBoundedText(res: Response, max = STREAM_MAX_BYTES): Promise<string> {
  const body = res.body as ReadableStream<Uint8Array> | null;
  const streamable = body && typeof body.getReader === 'function';
  if (!streamable && typeof res.arrayBuffer !== 'function') return res.text();
  return new TextDecoder().decode(await readBounded(res, max));
}
