// Entry for the stream-capture core bundle. Same rationale as core-entry.ts:
// `deno desktop`'s compile step can't resolve bare `@mbd/core/*` source
// imports, so the backend pre-bundles the HLS capture engine (which pulls in
// mux.ts/mp4box + the ssrf-guard + bounded-fetch transitively) into a single
// self-contained ESM (stream.gen.js) the backend imports by relative path.
// DASH support is a later task.
export { captureHls } from '@mbd/core/download/stream/hls';
export { browserHlsDeps, webcryptoDecrypt } from '@mbd/core/download/stream/hls-webcrypto';
export type { HlsCaptureOptions, HlsCaptureResult, HlsVariant } from '@mbd/core/download/stream/hls';
