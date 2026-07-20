/**
 * Base64-encode bytes for a `data:` URL. Used by the background service worker
 * to turn a ZIP archive (built in the popup/bubble and sent over as bytes) into
 * a downloadable `data:application/zip;base64,…` URL — service workers have no
 * `URL.createObjectURL`, so a data URL is the only in-SW way to hand bytes to
 * `chrome.downloads`.
 */

/**
 * Encode a byte array to a base64 string. Chunked so a large archive never
 * blows the argument limit of `String.fromCharCode(...)` (a few tens of
 * thousands of args throws `RangeError: too many arguments`).
 */
export function u8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * UTF-8-safe base64 of a string. `btoa` only handles Latin-1, so a URL list or
 * JSON backup with non-ASCII would corrupt; percent-encode to UTF-8 bytes first.
 * Avoids `TextEncoder`, which isn't present in every worker/test environment.
 */
export function textToBase64(text: string): string {
  const latin1 = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return btoa(latin1);
}

/** Decode a base64 string back to bytes (used by tests to verify a round-trip). */
export function base64ToU8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
