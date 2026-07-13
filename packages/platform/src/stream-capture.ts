/**
 * StreamCaptureHost — the browser-capability seam over *where* HLS/DASH
 * segment assembly runs. The byte-logic itself is browser-agnostic and lives
 * in @mbd/core/download/stream; this contract only abstracts the execution
 * context that hosts it.
 *
 * Chrome/Edge assemble in a `chrome.offscreen` blob document; Firefox runs it
 * directly in the (DOM-capable) background/event page; Safari (no offscreen)
 * would run it in a hidden extension page.
 */
export interface StreamCaptureHost {
  /** Which context this host provides. */
  readonly kind: 'offscreen' | 'background' | 'page';
  /** Whether stream capture is available on this target at all. */
  readonly available: boolean;
  /** Ensure the byte-capable context exists before capture is dispatched to it. */
  ensureReady(): Promise<void>;
}
