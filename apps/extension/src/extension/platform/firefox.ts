/**
 * Firefox implementations of the capability seam. Firefox has chrome.downloads
 * and chrome.notifications (reused from chrome.ts), but:
 *  - no chrome.offscreen → stream capture runs directly in the DOM-capable
 *    background/event page (real feature parity, not a bail),
 *  - no dynamic declarativeNetRequest modifyHeaders session rules → the hotlink
 *    Referer retry is unavailable (available: false), so consumers fall back.
 */
import type { HeaderRules, StreamCaptureHost, CaptureRunRequest } from '@mbd/platform';
import { chromeDownloader, chromeNotifier } from './chrome';

export const firefoxDownloader = chromeDownloader;
export const firefoxNotifier = chromeNotifier;

export const firefoxHeaderRules: HeaderRules = {
  available: false,
  add: async () => { throw new Error('declarativeNetRequest header rules are unsupported on Firefox'); },
  remove: async () => {},
};

export const firefoxCaptureHost: StreamCaptureHost = {
  kind: 'background',
  available: true,
  ensureReady: async () => {},
  run: (req: CaptureRunRequest) => import('./run-capture').then((m) => m.runCaptureInProcess(req)),
};
