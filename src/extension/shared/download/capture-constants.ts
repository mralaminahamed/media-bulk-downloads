/**
 * Capture policy shared by the offscreen engine host (which enforces the cap)
 * and the background (which supplies quality/cap to the offscreen document).
 * Applies to BOTH the HLS and DASH engines — the `STREAM_` prefix is deliberate.
 */

/** Soft cap on assembled bytes for an offscreen capture (HLS or DASH). The whole
 *  file is held in memory before muxing, so an unbounded stream could OOM the
 *  offscreen document; this bounds it to a clean 'too-large' error instead. */
export const STREAM_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

/** Default capture quality — the variant/representation closest to 720p, a sane
 *  size/quality balance for typical VOD clips. */
export const STREAM_TARGET_HEIGHT = 720;
