/**
 * Pure, bounded original-capture loop for Facebook photo grids. Every browser
 * interaction (enumerate tiles, open a photo, wait for its original to land,
 * close the viewer, pace) is injected via OriginalCaptureDeps so the loop is
 * unit-testable. The extension forges NO request: `open()` clicks a real tile so
 * Facebook issues its own viewer request, which the MAIN-world sniffer captures.
 */
import { OriginalCaptureStopReason } from '@mbd/core/types';

/** One photo to capture: its fbid and how to open its viewer. */
export interface PhotoTarget {
  fbid: string;
  open: () => void;
}

export interface OriginalCaptureDeps {
  enumerate: () => PhotoTarget[];
  /** Is this fbid's full-res original already in the store? (skip + detect) */
  captured: (fbid: string) => boolean;
  /** Resolve true once the just-opened photo's original lands, false on timeout/abort. */
  waitForCapture: (fbid: string, signal: AbortSignal) => Promise<boolean>;
  /** Return from the viewer to the grid (history.back, bounded). */
  closeViewer: (signal: AbortSignal) => Promise<void>;
  /** Jittered delay between opens — gentle on rate limits. */
  pace: (signal: AbortSignal) => Promise<void>;
  onProgress: (opened: number, captured: number, total: number, reason?: OriginalCaptureStopReason) => void;
  now: () => number;
  /** Restore the scroll position after the run. */
  restore: () => void;
}

export interface OriginalCaptureOpts {
  maxPhotos: number;
  maxMs: number;
  signal: AbortSignal;
}

export const ORIGINAL_CAPTURE_DEFAULTS: Omit<OriginalCaptureOpts, 'signal'> = {
  maxPhotos: 60,
  maxMs: 180000,
};

export interface OriginalCaptureResult {
  opened: number;
  captured: number;
  skipped: number;
  stoppedBy: OriginalCaptureStopReason;
}

export async function runOriginalCapture(
  deps: OriginalCaptureDeps,
  opts: OriginalCaptureOpts,
): Promise<OriginalCaptureResult> {
  const start = deps.now();
  const targets = deps.enumerate();
  const total = targets.length;
  let opened = 0;
  let captured = 0;
  let skipped = 0;
  let reason: OriginalCaptureStopReason = 'complete';

  deps.onProgress(opened, captured, total);

  try {
    for (const t of targets) {
      if (opts.signal.aborted) { reason = 'aborted'; break; }
      if (opened >= opts.maxPhotos) { reason = 'max-photos'; break; }
      if (deps.now() - start >= opts.maxMs) { reason = 'max-time'; break; }

      // Already have the original (hydrated above-fold or a prior run) → don't
      // open it. Skips are free and don't count toward the maxPhotos ceiling,
      // which caps the risk-bearing action (opens), not the work list.
      if (deps.captured(t.fbid)) {
        skipped++;
        deps.onProgress(opened, captured, total);
        continue;
      }

      t.open();
      opened++;
      const got = await deps.waitForCapture(t.fbid, opts.signal);
      if (got) captured++;

      // Always return to the grid, even on abort, so we never strand the user in
      // the viewer.
      await deps.closeViewer(opts.signal);
      if (opts.signal.aborted) { reason = 'aborted'; break; }

      deps.onProgress(opened, captured, total);
      await deps.pace(opts.signal);
    }
  } catch {
    // A throw from any injected step must not discard partial progress.
    reason = 'error';
  } finally {
    deps.restore();
  }

  deps.onProgress(opened, captured, total, reason);
  return { opened, captured, skipped, stoppedBy: reason };
}
