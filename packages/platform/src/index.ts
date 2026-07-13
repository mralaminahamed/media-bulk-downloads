/**
 * @mbd/platform — the browser-capability seam.
 *
 * This package holds only the CONTRACTS (interfaces) and runtime feature
 * detection. The Chrome/Firefox/Safari IMPLEMENTATIONS will live in the app
 * layer (apps/extension/src/extension/platform/*, not yet created), because
 * they hold the divergent chrome.* APIs and read the WXT build-time browser
 * flag. Keeping the contracts here lets a new target be added by supplying one
 * folder of implementations without touching @mbd/core or @mbd/storage. The
 * seam is not yet wired — the background still calls chrome.* directly (see the
 * "wire the capability seam" follow-up in docs/architecture/monorepo-restructure.md).
 */
export type { Downloader, DownloadRequest, DownloadRecord, DownloadQuery, DownloadChangeListener } from '@mbd/platform/downloader';
export type { Notifier, NotificationOptions } from '@mbd/platform/notifier';
export type { HeaderRules, HeaderOverride } from '@mbd/platform/header-rules';
export type { StreamCaptureHost } from '@mbd/platform/stream-capture';
export type { Capabilities } from '@mbd/platform/capabilities';
export { detectCapabilities } from '@mbd/platform/capabilities';
