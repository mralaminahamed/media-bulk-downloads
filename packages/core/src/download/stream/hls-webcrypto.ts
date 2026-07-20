import { DecryptFn, HlsDeps, HlsByteRange } from '@mbd/core/download/stream/hls';
import { retryingFetch, FETCH_TIMEOUT_MS } from '@mbd/core/net/retry';
import { readBounded, readBoundedText } from '@mbd/core/download/stream/bounded-fetch';

/**
 * AES-128-CBC decrypt via the platform WebCrypto. HLS segments are PKCS7-padded,
 * which `crypto.subtle.decrypt('AES-CBC')` validates and strips — matching the
 * node:crypto path used in tests/validation.
 */

const netFetch = retryingFetch((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  fetch(url, { ...init, redirect: 'error' }), { timeoutMs: FETCH_TIMEOUT_MS });
/** A standalone ArrayBuffer copy — WebCrypto's BufferSource params reject the
 *  `ArrayBufferLike` of a plain Uint8Array under strict DOM types. */
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export const webcryptoDecrypt: DecryptFn = async (key, iv, data) => {
  const cryptoKey = await crypto.subtle.importKey('raw', buf(key), { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: buf(iv) }, cryptoKey, buf(data));
  return new Uint8Array(plain);
};

/**
 * HLS engine deps backed by the browser: `fetch` (an extension page — popup or
 * offscreen — with `<all_urls>` host permission bypasses page CORS) and
 * WebCrypto. Range requests are issued as a `Range` header; a 206 is expected.
 */
export function browserHlsDeps(onProgress?: (done: number, total: number) => void): HlsDeps {
  return {
    fetchText: async (url) => {
      const res = await netFetch(url);
      if (!res.ok) throw new Error(`Manifest fetch failed (${res.status}).`);
      return readBoundedText(res);
    },
    fetchBytes: async (url, range?: HlsByteRange) => {
      const init = range
        ? { headers: { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } }
        : undefined;
      const res = await netFetch(url, init);
      if (!res.ok && res.status !== 206) throw new Error(`Segment fetch failed (${res.status}).`);
      const bytes = await readBounded(res);
      if (range && res.status !== 206 && bytes.length > range.length) {
        return bytes.subarray(range.offset, range.offset + range.length);
      }
      return bytes;
    },
    decrypt: webcryptoDecrypt,
    concurrency: 6,
    onProgress,
  };
}
