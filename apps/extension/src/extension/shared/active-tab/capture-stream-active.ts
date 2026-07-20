import { AudioFormat, CaptureProgressMessage, CaptureStreamMessage, CaptureStreamResponse, ImageInfo } from '@mbd/core/types';

/**
 * A unique id for one capture run. Deliberately NOT crypto.randomUUID — that is
 * secure-context-only, and this helper also runs in the on-page bubble (a content
 * script) on plain http pages where randomUUID is undefined. A timestamp + random
 * suffix is unique enough to disambiguate concurrent captures.
 */
export const newCaptureRunId = (): string =>
  `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Ask the background to capture an HLS stream in the offscreen document. The
 * background owns the download and composes the status, so this only fires the
 * request, relays CAPTURE_PROGRESS broadcasts to `onProgress` while it runs, and
 * resolves the final status line. The capture itself continues even if the popup
 * closes before this resolves. Mirrors deep-scan-active-tab's listener pattern.
 */
export function requestCaptureStream(
  item: ImageInfo,
  sourcePage: { url: string; title?: string },
  onProgress: (done: number, total: number) => void,
  audioOnly = false,
  audioFormat?: AudioFormat,
  quality?: number | 'highest' | 'lowest',
): Promise<{ status: string; refusal?: { code: string } }> {
  return new Promise((resolve) => {
    const runId = newCaptureRunId();
    const listener = (msg: unknown): void => {
      const p = msg as CaptureProgressMessage;
      if (p && p.type === 'CAPTURE_PROGRESS' && p.runId === runId) onProgress(p.done, p.total);
    };
    chrome.runtime.onMessage.addListener(listener);
    const message: CaptureStreamMessage = {
      type: 'CAPTURE_STREAM', runId, item, sourcePage, audioOnly,
      ...(audioFormat ? { audioFormat } : {}),
      ...(quality != null ? { quality } : {}),
    };
    try {
      chrome.runtime.sendMessage(message, (response?: CaptureStreamResponse) => {
        chrome.runtime.onMessage.removeListener(listener);
        void chrome.runtime.lastError;
        resolve({ status: response?.status ?? 'Couldn’t capture the stream.', refusal: response?.refusal });
      });
    } catch {
      chrome.runtime.onMessage.removeListener(listener);
      resolve({ status: 'Couldn’t capture the stream.' });
    }
  });
}
