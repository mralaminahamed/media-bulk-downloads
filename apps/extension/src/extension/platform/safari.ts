/**
 * Safari implementations of the capability seam. Safari Web Extensions ship no
 * `browser.downloads`, no `browser.offscreen`, and no `browser.notifications`,
 * so this is the degraded target the whole seam exists for:
 *  - Downloader: fetch → blob → a `<a download>` click in the DOM-capable
 *    background page. Subdirectories are dropped (the anchor honors only a
 *    filename) and there is no byte progress, but the download IS tracked in a
 *    bounded in-memory registry so `search()`/`onChanged` report a terminal
 *    state — without that the queue's poller never settles an item and
 *    `reconcileQueue` re-issues it on every service-worker wake.
 *  - Notifier: no-op (available: false) — the popup shows an in-panel toast.
 *  - HeaderRules: no-op (available: false).
 *  - StreamCaptureHost: runs the engine in the background page (Safari's
 *    background is DOM-capable), then the Safari Downloader saves the blob.
 */
import type {
  Downloader, DownloadRequest, DownloadRecord, DownloadQuery, DownloadChangeListener,
  Notifier, HeaderRules, StreamCaptureHost, CaptureRunRequest,
} from '@mbd/platform';

/** The registry is memory-only and dies with the background page, so it exists
 *  purely to settle in-session downloads. Capped like the queue's finished list. */
const REGISTRY_CAP = 200;

let nextId = 1;
let records: DownloadRecord[] = [];
const listeners: DownloadChangeListener[] = [];

function remember(rec: DownloadRecord): void {
  records.push(rec);
  if (records.length > REGISTRY_CAP) records = records.slice(records.length - REGISTRY_CAP);
  for (const l of listeners) l({ id: rec.id, state: rec.state, error: rec.error });
}

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
      const filename = req.filename.split('/').pop() ?? req.filename;
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      const id = nextId++;
      // The anchor click hands the blob to Safari synchronously; there is no
      // progress or failure signal after it, so the click IS the completion.
      remember({ id, url: req.url, filename, state: 'complete' });
      return id;
    } catch {
      return undefined;
    }
  },
  search: async (query: DownloadQuery) => {
    if (query.id !== undefined) return records.filter((r) => r.id === query.id);
    const limit = query.limit ?? 0;
    return limit > 0 ? records.slice(-limit) : records.slice();
  },
  open: () => {}, // unsupported — the file went straight to the download folder
  show: () => {}, // unsupported — no reveal-in-folder
  cancel: () => {}, // unsupported — an <a download> click can't be cancelled
  onChanged: (listener: DownloadChangeListener) => { listeners.push(listener); },
};

/** @internal test seam */
export function __resetSafariDownloadsForTest(): void {
  nextId = 1;
  records = [];
  listeners.length = 0;
}

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
