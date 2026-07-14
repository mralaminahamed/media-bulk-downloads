/**
 * Notifier — the browser-capability seam over user notifications.
 *
 * Chrome/Edge/Firefox implement this with `chrome.notifications`; Safari (no
 * notifications API) degrades to an in-popup toast or a no-op.
 */

/** A basic notification to surface (e.g. "download complete", "nothing new"). */
export interface NotificationOptions {
  title: string;
  message: string;
  iconUrl?: string;
}

export interface Notifier {
  /** Whether desktop notifications are actually available on this target. */
  readonly available: boolean;
  /** Show a notification. On backends without the capability this is a no-op. */
  notify(options: NotificationOptions): void;
}
