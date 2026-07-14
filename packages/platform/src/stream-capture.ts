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

/** One stream to capture. */
export interface CaptureRunRequest {
  runId: string;
  manifestUrl: string;
  engine: 'hls' | 'dash';
  /** Target vertical resolution to pick from the variants. */
  quality: number;
  /** Hard byte ceiling for the assembled file. */
  maxBytes: number;
}

/** Result of a capture run — an object URL for the assembled file, or a failure
 *  code. Mirrors @mbd/core's CaptureRunResult so the app can reuse it. */
export type CaptureRunResult =
  | { ok: true; blobUrl: string; ext: string; segmentCount: number; muxedAudio: boolean }
  | { ok: false; code: string };

export interface StreamCaptureHost {
  /** Which context this host provides. */
  readonly kind: 'offscreen' | 'background' | 'page';
  /** Whether stream capture is available on this target at all. */
  readonly available: boolean;
  /** Ensure the byte-capable context exists before a run is dispatched to it. */
  ensureReady(): Promise<void>;
  /** Assemble the stream and return an object URL for the muxed file (or a
   *  failure code). Chrome dispatches to the offscreen doc; Firefox/Safari run
   *  the engine in their own DOM-capable context. */
  run(request: CaptureRunRequest): Promise<CaptureRunResult>;
}
