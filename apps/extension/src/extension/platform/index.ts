/**
 * The app's browser-capability seam: one Platform bundle of implementations,
 * chosen at build time from the WXT target. Every browser-divergent API
 * (downloads, notifications, header rules, stream capture) is reached through
 * this instead of touching chrome.* directly, so adding a target means adding
 * one implementation file — not threading `import.meta.env` branches through the
 * background.
 */
import type { Downloader, Notifier, HeaderRules, StreamCaptureHost, Capabilities } from '@mbd/platform';
import { detectCapabilities } from '@mbd/platform';
import { chromeDownloader, chromeNotifier, chromeHeaderRules, chromeCaptureHost } from './chrome';
import { firefoxDownloader, firefoxNotifier, firefoxHeaderRules, firefoxCaptureHost } from './firefox';
import { safariDownloader, safariNotifier, safariHeaderRules, safariCaptureHost } from './safari';

export interface Platform {
  downloader: Downloader;
  notifier: Notifier;
  headerRules: HeaderRules;
  captureHost: StreamCaptureHost;
  capabilities: Capabilities;
}

/** Pick the implementation set for the build's target. The `import.meta.env`
 *  flags are build-time constants, so esbuild dead-code-eliminates the branches
 *  (and the unused browsers' implementation modules) from each bundle. */
export function selectPlatform(): Platform {
  const capabilities = detectCapabilities();
  if ((import.meta.env.BROWSER as string) === 'safari') {
    return { downloader: safariDownloader, notifier: safariNotifier, headerRules: safariHeaderRules, captureHost: safariCaptureHost, capabilities };
  }
  if (import.meta.env.FIREFOX) {
    return { downloader: firefoxDownloader, notifier: firefoxNotifier, headerRules: firefoxHeaderRules, captureHost: firefoxCaptureHost, capabilities };
  }
  return { downloader: chromeDownloader, notifier: chromeNotifier, headerRules: chromeHeaderRules, captureHost: chromeCaptureHost, capabilities };
}

/** The selected platform for this build. Import this from the background. */
export const platform: Platform = selectPlatform();
