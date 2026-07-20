/**
 * Safari implementations of the capability seam. Safari Web Extensions ship no
 * `browser.downloads`, no `browser.offscreen`, and no `browser.notifications`,
 * so this is the degraded target the whole seam exists for:
 *  - Downloader: fetch → blob → a `<a download>` click in the DOM-capable
 *    background page. No download id, no progress, no on-disk history/dedupe,
 *    and subdirectories are dropped (the anchor honors only a filename).
 *  - Notifier: no-op (available: false) — the popup shows an in-panel toast.
 *  - HeaderRules: no-op (available: false).
 *  - StreamCaptureHost: runs the engine in the background page (Safari's
 *    background is DOM-capable), then the Safari Downloader saves the blob.
 */
import type {
  Downloader, DownloadRequest, Notifier, HeaderRules, StreamCaptureHost, CaptureRunRequest,
} from '@mbd/platform';

export const safariDownloader: Downloader = {
  available: true,
  download: async (req: DownloadRequest) => {
    try {
      let href = req.url;
      let objectUrl: string | undefined;
      if (/^https?:/i.test(req.url)) {
        const res = await fetch(req.url);
        if (!res.ok) return undefined;
        objectUrl = URL.createObjectURL(await res.blob());
        href = objectUrl;
      }
      const a = document.createElement('a');
      a.href = href;
      a.download = req.filename.split('/').pop() ?? req.filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return 1;
    } catch {
      return undefined;
    }
  },
  search: async () => [], // no downloads API → no on-disk history to query
  open: () => {}, // unsupported — no download id to open
  show: () => {}, // unsupported — no reveal-in-folder
  onChanged: () => {}, // no progress/completion events
};

export const safariNotifier: Notifier = {
  available: false,
  notify: () => {}, // the popup surfaces an in-panel toast instead
};

export const safariHeaderRules: HeaderRules = {
  available: false,
  add: async () => { throw new Error('declarativeNetRequest header rules are unsupported on Safari'); },
  remove: async () => {},
};

export const safariCaptureHost: StreamCaptureHost = {
  kind: 'page',
  available: true,
  ensureReady: async () => {},
  run: (req: CaptureRunRequest) => import('./run-capture').then((m) => m.runCaptureInProcess(req)),
};
