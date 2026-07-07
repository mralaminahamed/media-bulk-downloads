import { captureHls, HlsError } from '@/extension/shared/download/hls';
import { browserHlsDeps } from '@/extension/shared/download/hls-webcrypto';
import { CaptureRunMessage, CaptureRunResult } from '@/types';

/**
 * The offscreen document's capture host. The offscreen realm has DOM APIs
 * (URL.createObjectURL, WebCrypto) and, with <all_urls>, a CORS-free fetch — but
 * no chrome.downloads. It runs the HLS engine, broadcasts progress for the popup,
 * and hands the assembled bytes back as a same-extension blob URL for the
 * background to download. mp4box (via the engine's mux path) loads here, off the
 * popup bundle.
 */
export function installOffscreenCaptureHost(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || (message as { type?: unknown }).type !== 'CAPTURE_RUN') return;
    const { manifestUrl, quality, maxBytes } = message as CaptureRunMessage;
    void runCapture(manifestUrl, quality, maxBytes).then(sendResponse);
    return true; // response is sent asynchronously
  });
}

async function runCapture(manifestUrl: string, quality: number, maxBytes: number): Promise<CaptureRunResult> {
  try {
    const res = await captureHls(
      manifestUrl,
      browserHlsDeps((done, total) => {
        void chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', done, total });
      }),
      { quality, maxBytes },
    );
    // A standalone ArrayBuffer copy — Blob rejects a plain Uint8Array's
    // ArrayBufferLike backing under strict DOM types.
    const ab = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength) as ArrayBuffer;
    const blobUrl = URL.createObjectURL(new Blob([ab], { type: res.mime }));
    // Keep the blob alive long enough for the background's chrome.downloads to read it.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return { ok: true, blobUrl, ext: res.ext, mime: res.mime, segmentCount: res.segmentCount, muxedAudio: !!res.muxedAudio };
  } catch (e) {
    return { ok: false, code: e instanceof HlsError ? e.code : 'unknown' };
  }
}
