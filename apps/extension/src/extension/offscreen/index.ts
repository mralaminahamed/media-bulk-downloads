import { captureHls, HlsError } from '@mbd/core/download/stream/hls';
import { captureDash, DashError } from '@mbd/core/download/stream/dash';
import { browserHlsDeps } from '@mbd/core/download/stream/hls-webcrypto';
import { browserDashDeps } from '@mbd/core/download/stream/dash-fetch';
import { CaptureRunMessage, CaptureRunResult } from '@mbd/core/types';

/**
 * The offscreen document's capture host. The offscreen realm has DOM APIs
 * (URL.createObjectURL, WebCrypto) and, with <all_urls>, a CORS-free fetch — but
 * no chrome.downloads. It runs the HLS or DASH engine (per the message's
 * `engine`), broadcasts progress for the popup, and hands the assembled bytes
 * back as a same-extension blob URL for the background to download. mp4box (via
 * the engines' mux path) loads here, off the popup bundle.
 */
export function installOffscreenCaptureHost(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || (message as { type?: unknown }).type !== 'CAPTURE_RUN') return;
    const { runId, manifestUrl, engine, quality, maxBytes, audioOnly } = message as CaptureRunMessage;
    void runCapture(runId, manifestUrl, engine, quality, maxBytes, !!audioOnly).then(sendResponse);
    return true; // response is sent asynchronously
  });
}

async function runCapture(
  runId: string,
  manifestUrl: string,
  engine: 'hls' | 'dash',
  quality: CaptureRunMessage['quality'],
  maxBytes: number,
  audioOnly: boolean,
): Promise<CaptureRunResult> {
  const onProgress = (done: number, total: number): void => {
    void chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', runId, done, total });
  };
  try {
    const res = engine === 'dash'
      ? await captureDash(manifestUrl, browserDashDeps(onProgress), { quality, maxBytes, audioOnly })
      : await captureHls(manifestUrl, browserHlsDeps(onProgress), { quality, maxBytes, audioOnly });
    // A standalone ArrayBuffer copy — Blob rejects a plain Uint8Array's
    // ArrayBufferLike backing under strict DOM types.
    const ab = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength) as ArrayBuffer;
    const blobUrl = URL.createObjectURL(new Blob([ab], { type: res.mime }));
    // Keep the blob alive long enough for the background's chrome.downloads to read it.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return { ok: true, blobUrl, ext: res.ext, segmentCount: res.segmentCount, muxedAudio: !!res.muxedAudio };
  } catch (e) {
    const code = e instanceof HlsError || e instanceof DashError ? e.code : 'unknown';
    return { ok: false, code };
  }
}
