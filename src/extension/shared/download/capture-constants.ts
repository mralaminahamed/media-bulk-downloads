/**
 * Capture policy shared by the offscreen engine host (which enforces the cap)
 * and the background (which supplies quality/cap to the offscreen document).
 */

/** Soft cap on assembled bytes for an offscreen capture. The whole file is held
 *  in memory before muxing, so an unbounded stream could OOM the offscreen
 *  document; this bounds it to a clean 'too-large' error instead. */
export const HLS_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

/** Default capture quality — the variant closest to 720p, a sane size/quality
 *  balance for typical VOD clips. */
export const HLS_TARGET_HEIGHT = 720;
