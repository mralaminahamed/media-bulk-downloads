/**
 * Chrome/Edge/Opera implementations of the @mbd/platform capability seam. Thin
 * wrappers over the chrome.* APIs — the behavior the extension has always had.
 * Firefox reuses most of these (firefox.ts); Safari diverges (safari.ts).
 */
import type {
  Downloader, DownloadRecord, Notifier, HeaderRules, HeaderOverride,
  StreamCaptureHost, CaptureRunRequest, CaptureRunResult,
} from '@mbd/platform';

function toRecord(d: chrome.downloads.DownloadItem): DownloadRecord {
  return {
    id: d.id,
    filename: d.filename,
    state: d.state as DownloadRecord['state'],
    bytesReceived: d.bytesReceived,
    totalBytes: d.totalBytes,
    error: d.error,
    exists: d.exists,
  };
}

export const chromeDownloader: Downloader = {
  available: true,
  download: (req) =>
    new Promise((resolve) =>
      chrome.downloads.download(
        { url: req.url, filename: req.filename, saveAs: req.saveAs, conflictAction: req.conflictAction },
        (id) => resolve(chrome.runtime.lastError || id === undefined ? undefined : id),
      ),
    ),
  search: async (q) => (await chrome.downloads.search({ id: q.id, limit: q.limit })).map(toRecord),
  open: (id) => chrome.downloads.open(id),
  show: (id) => chrome.downloads.show(id),
  onChanged: (listener) =>
    chrome.downloads.onChanged.addListener((d) =>
      listener({ id: d.id, state: d.state?.current as DownloadRecord['state'] | undefined, error: d.error?.current }),
    ),
};

export const chromeNotifier: Notifier = {
  available: typeof chrome !== 'undefined' && !!chrome.notifications,
  notify: (o) => {
    if (!chrome.notifications) return;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: o.iconUrl ?? chrome.runtime.getURL('icon/128.png'),
      title: o.title,
      message: o.message,
    });
  },
};

// Monotonic session-rule id (seed once above any pre-existing rules, then
// increment synchronously so overlapping callers can't collide). Mirrors the
// hardening in hotlink-rewrite.ts.
let ruleIdSeq = 0;
let ruleIdSeeded: Promise<void> | null = null;
async function nextRuleId(): Promise<number> {
  if (!ruleIdSeeded) {
    ruleIdSeeded = chrome.declarativeNetRequest
      .getSessionRules()
      .then((rules) => { ruleIdSeq = rules.reduce((m, r) => Math.max(m, r.id), 0); })
      .catch(() => { ruleIdSeq = 0; });
  }
  await ruleIdSeeded;
  return ++ruleIdSeq;
}

export const chromeHeaderRules: HeaderRules = {
  available: true,
  add: async (rule: HeaderOverride) => {
    const id = await nextRuleId();
    const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
      { header: 'referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: rule.referer },
    ];
    if (rule.origin) {
      requestHeaders.push({ header: 'origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: rule.origin });
    }
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id,
        priority: 1,
        condition: { urlFilter: rule.urlFilter },
        action: { type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType, requestHeaders },
      }],
    });
    return id;
  },
  remove: async (id) => {
    try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }); } catch { /* already gone */ }
  },
};

// Chrome/Edge assemble HLS/DASH in a chrome.offscreen blob document (the service
// worker has no createObjectURL). This host owns that doc and dispatches the run.
const OFFSCREEN_URL = 'offscreen.html';
export const chromeCaptureHost: StreamCaptureHost = {
  kind: 'offscreen',
  available: true,
  ensureReady: async () => {
    if (await chrome.offscreen.hasDocument()) return;
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: 'Assemble HLS/DASH stream segments into a downloadable video file.',
      });
    } catch (e) {
      if (!(await chrome.offscreen.hasDocument())) throw e;
    }
  },
  run: async (req: CaptureRunRequest): Promise<CaptureRunResult> => {
    await chromeCaptureHost.ensureReady();
    const result = (await chrome.runtime.sendMessage({
      type: 'CAPTURE_RUN',
      runId: req.runId,
      manifestUrl: req.manifestUrl,
      engine: req.engine,
      quality: req.quality,
      maxBytes: req.maxBytes,
    })) as CaptureRunResult | undefined;
    return result ?? { ok: false, code: 'unknown' };
  },
};
