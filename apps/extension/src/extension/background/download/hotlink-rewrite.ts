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
 */

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
 * referer checks). Rule ids are allocated above the current max session-rule id
 * so a worker restart can't collide with a lingering rule.
 */
let ruleIdSeq = 0;
let ruleIdSeeded: Promise<void> | null = null;
async function nextRuleId(): Promise<number> {
  if (!ruleIdSeeded) {
    ruleIdSeeded = chrome.declarativeNetRequest
      .getSessionRules()
      .then((rules) => { ruleIdSeq = rules.reduce((max, r) => Math.max(max, r.id), 0); })
      .catch(() => { ruleIdSeq = 0; });
  }
  await ruleIdSeeded;
  return ++ruleIdSeq;
}

/** Test-only: reset the id seed so a test re-seeds from its mocked session rules,
 *  matching how the module starts fresh on each service-worker launch. */
export function __resetRefererRuleIdsForTest(): void {
  ruleIdSeq = 0;
  ruleIdSeeded = null;
}

export async function applyRefererRule(url: string, refererPageUrl?: string): Promise<number> {
  const referer = refererPageUrl && originOf(refererPageUrl) ? refererPageUrl : originOf(url);
  const origin = originOf(referer);
  const id = await nextRuleId();
  const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
    { header: 'referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: referer },
  ];
  if (origin) {
    requestHeaders.push({ header: 'origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: origin });
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id,
        priority: 1,
        condition: { urlFilter: `|${url}` },
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders,
        },
      },
    ],
  });
  return id;
}

/** Remove a session rule added by applyRefererRule. Never throws. */
export async function removeRefererRule(id: number): Promise<void> {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] });
  } catch {
    // Rule already gone / DNR unavailable — nothing to clean up.
  }
}
