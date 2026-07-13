import { DecryptFn, HlsDeps, HlsByteRange } from '@mbd/core/download/stream/hls';
import { retryingFetch } from '@mbd/core/net/retry';

/**
 * AES-128-CBC decrypt via the platform WebCrypto. HLS segments are PKCS7-padded,
 * which `crypto.subtle.decrypt('AES-CBC')` validates and strips — matching the
 * node:crypto path used in tests/validation.
 */

// Retry transient segment/manifest failures so one flaky fetch doesn't abort the
// whole capture. Bound closure: the global fetch must not be invoked unbound.
//
// `redirect: 'error'` closes an SSRF-guard bypass: assertSafeCaptureUrl only
// validates the pre-fetch URL, so a manifest/segment host that passes the guard
// could 302 to an internal target (169.254.169.254, localhost, a LAN service)
// that the default redirect:'follow' would then GET from this <all_urls> context.
// Failing the redirect never issues that internal request; a rare legit
// redirect just degrades to a fetch error.
const netFetch = retryingFetch((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  fetch(url, { ...init, redirect: 'error' }));
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
      return res.text();
    },
    fetchBytes: async (url, range?: HlsByteRange) => {
      const init = range
        ? { headers: { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } }
        : undefined;
      const res = await netFetch(url, init);
      if (!res.ok && res.status !== 206) throw new Error(`Segment fetch failed (${res.status}).`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // A server may ignore the Range header and answer 200 with the WHOLE file.
      // Without this, every EXT-X-BYTERANGE "segment" would be the entire file →
      // the concatenated output is N copies of it, corrupt and oversized. Slice
      // out the requested window ourselves when we clearly got more than asked.
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
