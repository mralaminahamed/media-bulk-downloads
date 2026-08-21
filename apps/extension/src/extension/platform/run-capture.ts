import type { CaptureRunRequest, CaptureRunResult } from '@mbd/platform';
import { runCaptureInContext } from '@/extension/capture/run-in-context';

/**
 * Firefox/Safari capture host: run the shared capture core directly in the
 * DOM-capable background/extension page (no offscreen API). Chrome uses the
 * offscreen document instead (see extension/offscreen/index.ts); both share
 * `runCaptureInContext`, so audio-only + MP3 transcode behave identically.
 */
export function runCaptureInProcess(req: CaptureRunRequest): Promise<CaptureRunResult> {
  return runCaptureInContext(req);
}
