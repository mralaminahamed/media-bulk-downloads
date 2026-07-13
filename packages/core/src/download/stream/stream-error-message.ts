import { STREAM_MAX_BYTES } from '@mbd/core/download/stream/capture-constants';

/**
 * A user-facing message for a failed stream capture (HLS or DASH), from the
 * engine error `code` that crossed the offscreen→background message boundary.
 * Composed in the background so the status is complete even if the popup closed.
 */
export function streamErrorMessage(code: string): string {
  switch (code) {
    case 'live': return 'Live streams can’t be captured — there is no fixed end.';
    case 'drm': return 'This stream is DRM-protected and can’t be captured.';
    case 'sample-aes': return 'This stream uses SAMPLE-AES encryption, which isn’t supported.';
    case 'too-large': return `Stream is too large to capture (over ${Math.round(STREAM_MAX_BYTES / 1024 / 1024 / 1024)} GB).`;
    case 'demuxed-unsupported': return 'This stream delivers audio separately in a format that can’t be combined.';
    case 'no-representations': return 'This stream has no downloadable video.';
    case 'unsupported': return 'This stream uses a format that can’t be captured.';
    case 'unsupported_browser': return 'Stream capture isn’t available in this browser yet.';
    case 'empty': return 'Nothing could be downloaded from this stream.';
    case 'fetch-failed': return 'Part of the stream couldn’t be downloaded.';
    default: return `Couldn’t capture the stream (${code}).`;
  }
}
