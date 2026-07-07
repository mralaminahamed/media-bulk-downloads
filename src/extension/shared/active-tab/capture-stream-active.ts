import { CaptureProgressMessage, CaptureStreamMessage, CaptureStreamResponse, ImageInfo } from '@/types';

/**
 * Ask the background to capture an HLS stream in the offscreen document. The
 * background owns the download and composes the status, so this only fires the
 * request, relays CAPTURE_PROGRESS broadcasts to `onProgress` while it runs, and
 * resolves the final status line. The capture itself continues even if the popup
 * closes before this resolves. Mirrors deep-scan-active-tab's listener pattern.
 */
export function requestCaptureStream(
  manifestUrl: string,
  item: ImageInfo,
  sourcePage: { url: string; title?: string },
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve) => {
    const listener = (msg: unknown): void => {
      if (msg && (msg as CaptureProgressMessage).type === 'CAPTURE_PROGRESS') {
        const p = msg as CaptureProgressMessage;
        onProgress(p.done, p.total);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    const message: CaptureStreamMessage = { type: 'CAPTURE_STREAM', manifestUrl, item, sourcePage };
    chrome.runtime.sendMessage(message, (response?: CaptureStreamResponse) => {
      chrome.runtime.onMessage.removeListener(listener);
      void chrome.runtime.lastError;
      resolve(response?.status ?? 'Couldn’t capture the stream.');
    });
  });
}
