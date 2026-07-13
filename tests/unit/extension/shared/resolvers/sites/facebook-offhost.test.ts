/**
 * facebookResolver.match gates on `onFacebook()` (location.hostname), not just
 * the fbcdn CDN-host regex. jsdom's `location` is immutable at runtime — it can
 * neither be redefined nor reassigned to another origin — so proving the "off
 * facebook.com" half of that gate needs a location that genuinely isn't
 * facebook.com. This file intentionally does NOT pin `@vitest-environment-options`,
 * so it stays at jsdom's default (non-facebook) location — same technique
 * content.test.ts uses to prove the X/IG relays are NOT wired off their platforms.
 * The "on facebook.com" half lives in the sibling facebook.test.ts, which pins
 * the location to https://www.facebook.com/.
 */
import { facebookResolver, __resetFbResolver } from '@mbd/core/resolvers/sites/facebook';

beforeEach(() => __resetFbResolver());

describe('facebookResolver.match — off facebook.com', () => {
  it('is false for a genuine fbcdn URL when location.hostname is not a facebook.com host', () => {
    expect(location.hostname).not.toMatch(/(^|\.)facebook\.com$/);
    expect(facebookResolver.match(new URL('https://x.fbcdn.net/a.jpg'), { allowNetwork: false })).toBe(false);
  });
});
