import { HLS_MAX_BYTES } from './capture-constants';

/**
 * A user-facing message for a failed stream capture, from the engine error
 * `code` that crossed the offscreen→background message boundary. Composed in the
 * background (not the popup) so the status is complete even if the popup closed.
 */
export function hlsErrorMessage(code: string): string {
  switch (code) {
    case 'live': return 'Live streams can’t be captured — there is no fixed end.';
    case 'drm': return 'This stream is DRM-protected and can’t be captured.';
    case 'sample-aes': return 'This stream uses SAMPLE-AES encryption, which isn’t supported.';
    case 'too-large': return `Stream is too large to capture (over ${Math.round(HLS_MAX_BYTES / 1024 / 1024 / 1024)} GB).`;
    case 'demuxed-unsupported': return 'This stream delivers audio separately in a format that can’t be combined.';
    default: return `Couldn’t capture the stream (${code}).`;
  }
}
