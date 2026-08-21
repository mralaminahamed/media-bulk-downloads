/**
 * Hotlink 403 fix (#197). Many CDNs return 403 to a media request whose `Referer`
 * doesn't match the origin site; extension downloads carry none. When a queued
 * download 403s, the dispatcher installs a short-lived `declarativeNetRequest`
 * session rule that sets `Referer` (and `Origin`) to the item's source page for
 * that one URL, retries, then tears the rule down. Restores access to media the
 * user can already view — not an auth/paywall bypass.
 *
 * `declarativeNetRequestWithHostAccess` is an OPTIONAL permission: the request must come from a
 * user gesture (the popup's "Retry with page referer"), never the background SW.
 *
 * The DNR session-rule mechanics live in the platform seam (`platform.headerRules`,
 * a no-op on Firefox/Safari); this module owns only the referer/origin business
 * logic and the optional-permission gating (chrome.permissions is not part of the
 * seam).
 */
import { platform } from '@/extension/platform';

const DNR_PERMISSION: chrome.permissions.Permissions = { permissions: ['declarativeNetRequestWithHostAccess'] };

export function hasDnrPermission(): Promise<boolean> {
  try {
    return chrome.permissions.contains(DNR_PERMISSION);
  } catch {
    return Promise.resolve(false);
  }
}

/** Must be called from a user gesture (popup click). */
export function requestDnrPermission(): Promise<boolean> {
  return chrome.permissions.request(DNR_PERMISSION);
}

function originOf(u: string): string {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
}

/**
 * Add a session rule that sets Referer + Origin on requests to `url`, returning
 * its rule id (for later teardown). `refererPageUrl` is the item's source page;
 * when absent, falls back to the media URL's own origin (still lifts many CDN
 * referer checks). Delegates the DNR mechanics + id allocation to the seam.
 */
export async function applyRefererRule(url: string, refererPageUrl?: string): Promise<number> {
  const referer = refererPageUrl && originOf(refererPageUrl) ? refererPageUrl : originOf(url);
  const origin = originOf(referer);
  return platform.headerRules.add({ urlFilter: `|${url}`, referer, origin: origin || undefined });
}

/** Remove a session rule added by applyRefererRule. Never throws (seam contract). */
export async function removeRefererRule(id: number): Promise<void> {
  await platform.headerRules.remove(id);
}
