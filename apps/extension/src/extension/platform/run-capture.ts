import { captureHls, HlsError } from '@mbd/core/download/stream/hls';
import { captureDash, DashError } from '@mbd/core/download/stream/dash';
import { browserHlsDeps } from '@mbd/core/download/stream/hls-webcrypto';
import { browserDashDeps } from '@mbd/core/download/stream/dash-fetch';
import type { CaptureRunRequest, CaptureRunResult } from '@mbd/platform';

/**
 * Assemble an HLS/DASH stream in the CURRENT DOM-capable realm and return an
 * object URL for the muxed file. Chrome runs this inside the offscreen document;
 * Firefox and Safari run it directly in their DOM-capable background page (no
 * offscreen API). Broadcasts CAPTURE_PROGRESS for the popup/bubble, exactly like
 * the offscreen host. Requires URL.createObjectURL + WebCrypto + a CORS-free
 * fetch (all present in every host that calls it).
 */
export async function runCaptureInProcess(req: CaptureRunRequest): Promise<CaptureRunResult> {
  const onProgress = (done: number, total: number): void => {
    void chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', runId: req.runId, done, total });
  };
  try {
    const res = req.engine === 'dash'
      ? await captureDash(req.manifestUrl, browserDashDeps(onProgress), { quality: req.quality, maxBytes: req.maxBytes })
      : await captureHls(req.manifestUrl, browserHlsDeps(onProgress), { quality: req.quality, maxBytes: req.maxBytes });
    const ab = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength) as ArrayBuffer;
    const blobUrl = URL.createObjectURL(new Blob([ab], { type: res.mime }));
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return { ok: true, blobUrl, ext: res.ext, segmentCount: res.segmentCount, muxedAudio: !!res.muxedAudio };
  } catch (e) {
    const code = e instanceof HlsError || e instanceof DashError ? e.code : 'unknown';
    return { ok: false, code };
  }
}
