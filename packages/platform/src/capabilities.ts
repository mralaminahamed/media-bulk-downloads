/**
 * Capabilities — runtime feature detection for the current browser target.
 *
 * Detection is by presence of the API objects, never by user-agent sniffing,
 * so a target that gains an API later is picked up automatically. The app uses
 * this descriptor to degrade gracefully: hide the download queue / on-disk
 * dedupe / stream capture / desktop notifications where the backing API is
 * absent (notably Safari).
 */

/** Which browser-divergent capabilities the current target actually provides. */
export interface Capabilities {
  /** `chrome.downloads` — bulk queue, on-disk dedupe, progress, reveal. */
  hasDownloadsApi: boolean;
  /** `chrome.offscreen` — offscreen blob document for HLS/DASH assembly. */
  hasOffscreen: boolean;
  /** `chrome.notifications` — desktop notifications. */
  hasNotifications: boolean;
  /** `chrome.declarativeNetRequest` — request-header rewriting (hotlink retry). */
  hasHeaderRules: boolean;
}

/** Minimal structural view of the extension global, to avoid a hard `@types/chrome` dependency. */
interface ExtensionGlobals {
  downloads?: unknown;
  offscreen?: unknown;
  notifications?: unknown;
  declarativeNetRequest?: unknown;
}

function extensionApis(): ExtensionGlobals | undefined {
  const g = globalThis as { chrome?: ExtensionGlobals; browser?: ExtensionGlobals };
  return g.chrome ?? g.browser;
}

/** Detect the current target's capabilities from the available extension APIs. */
export function detectCapabilities(): Capabilities {
  const api = extensionApis();
  return {
    hasDownloadsApi: !!api?.downloads,
    hasOffscreen: !!api?.offscreen,
    hasNotifications: !!api?.notifications,
    hasHeaderRules: !!api?.declarativeNetRequest,
  };
}
