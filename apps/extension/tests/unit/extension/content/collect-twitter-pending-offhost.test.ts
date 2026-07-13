/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://example.com/" }
 *
 * The twitter pending-cell pass (collect-twitter-pending.test.ts) is gated to the
 * x.com/twitter.com host — an unrelated site that happens to have a path shaped
 * like `/u/status/<id>/photo/<n>` must not be scanned for pending twitter items.
 * Uses the REAL collector (no mocks); a separate file is required because jsdom's
 * `url` is pinned per-file via the environment-options header above.
 */
import { collectMedia } from '@/extension/content/collect';

describe('collectMedia — Twitter pending cells, off twitter hosts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not emit twitter pending items off twitter hosts', () => {
    document.body.innerHTML = `<a href="/u/status/1700000000000000004/photo/1"><div></div></a>`;
    const items = collectMedia();
    expect(items.some((m) => m.unresolvedImage)).toBe(false);
    expect(items.some((m) => m.unresolvedVideo)).toBe(false);
  });
});
