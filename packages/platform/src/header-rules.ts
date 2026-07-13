/**
 * HeaderRules — the browser-capability seam over request-header rewriting,
 * used for the hotlink-403 Referer/Origin retry.
 *
 * Chrome/Edge implement this with `chrome.declarativeNetRequest` session rules
 * (behind an optional permission); Firefox/Safari, where dynamic header-modify
 * rules are limited or absent, degrade to a no-op.
 */

/** A temporary request-header override scoped to a URL pattern. */
export interface HeaderOverride {
  /** declarativeNetRequest-style URL filter the override applies to. */
  urlFilter: string;
  /** Referer to send. */
  referer: string;
  /** Origin to send (omitted when the request should carry no explicit Origin). */
  origin?: string;
}

export interface HeaderRules {
  /** Whether request-header rewriting is available on this target. */
  readonly available: boolean;
  /** Install an override; resolves to a handle used to remove it. */
  add(rule: HeaderOverride): Promise<number>;
  /** Remove a previously-installed override. */
  remove(id: number): Promise<void>;
}
