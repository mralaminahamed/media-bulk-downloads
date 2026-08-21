import type { CaptureRunMessage } from '@mbd/core/types';
import { runCaptureInContext } from '@/extension/capture/run-in-context';

/**
 * The offscreen document's capture host. The offscreen realm has DOM APIs
 * (URL.createObjectURL, WebCrypto, Web Audio) and, with <all_urls>, a CORS-free
 * fetch — but no chrome.downloads. It runs the shared capture core (HLS/DASH
 * assembly + optional MP3 transcode) and hands the assembled bytes back as a blob
 * URL for the background to download. mp4box + lamejs load here, off the popup
 * bundle. Firefox/Safari run the same core in their background/extension page
 * (see platform/run-capture.ts) — this is the Chrome offscreen host only.
 */
export function installOffscreenCaptureHost(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || (message as { type?: unknown }).type !== 'CAPTURE_RUN') return;
    const { runId, manifestUrl, engine, quality, maxBytes, audioOnly, audioFormat } = message as CaptureRunMessage;
    void runCaptureInContext({ runId, manifestUrl, engine, quality, maxBytes, audioOnly: !!audioOnly, audioFormat }).then(sendResponse);
    return true;
  });
}
