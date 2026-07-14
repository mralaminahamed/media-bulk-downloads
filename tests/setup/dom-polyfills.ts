// Shared jsdom polyfills for package test projects that don't touch chrome.*
// (e.g. @mbd/core). Mirrors the relevant parts of the app's setupTests.ts.

// jsdom does not implement Blob.prototype.arrayBuffer; some download/convert
// code sniffs a blob's header bytes, so provide a FileReader-backed polyfill.
if (!(Blob.prototype as { arrayBuffer?: unknown }).arrayBuffer) {
  (Blob.prototype as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(this);
    });
  };
}

// jsdom does not implement window.scrollTo/scrollBy — stub as no-ops so the
// deep-scan loop's scroll calls don't spam the virtual console.
if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  window.scrollBy = (() => {}) as typeof window.scrollBy;
}
