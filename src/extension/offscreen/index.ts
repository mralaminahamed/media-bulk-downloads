import { captureHls, HlsError } from '@/extension/shared/download/hls';
import { captureDash, DashError } from '@/extension/shared/download/dash';
import { browserHlsDeps } from '@/extension/shared/download/hls-webcrypto';
import { browserDashDeps } from '@/extension/shared/download/dash-fetch';
import { CaptureRunMessage, CaptureRunResult } from '@/types';

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
    const { manifestUrl, engine, quality, maxBytes } = message as CaptureRunMessage;
    void runCapture(manifestUrl, engine, quality, maxBytes).then(sendResponse);
    return true; // response is sent asynchronously
  });
}

async function runCapture(
  manifestUrl: string,
  engine: 'hls' | 'dash',
  quality: number,
  maxBytes: number,
): Promise<CaptureRunResult> {
  const onProgress = (done: number, total: number): void => {
    void chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', done, total });
  };
  try {
    const res = engine === 'dash'
      ? await captureDash(manifestUrl, browserDashDeps(onProgress), { quality, maxBytes })
      : await captureHls(manifestUrl, browserHlsDeps(onProgress), { quality, maxBytes });
    // A standalone ArrayBuffer copy — Blob rejects a plain Uint8Array's
    // ArrayBufferLike backing under strict DOM types.
    const ab = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength) as ArrayBuffer;
    const blobUrl = URL.createObjectURL(new Blob([ab], { type: res.mime }));
    // Keep the blob alive long enough for the background's chrome.downloads to read it.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return { ok: true, blobUrl, ext: res.ext, mime: res.mime, segmentCount: res.segmentCount, muxedAudio: !!res.muxedAudio };
  } catch (e) {
    const code = e instanceof HlsError || e instanceof DashError ? e.code : 'unknown';
    return { ok: false, code };
  }
}
