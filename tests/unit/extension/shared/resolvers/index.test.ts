/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.facebook.com/" }
 *
 * facebookResolver.match reads location.hostname (onFacebook gate), so this
 * file pins jsdom's location to facebook.com to exercise the real routing
 * path through the shared `resolve()` — same pattern as
 * sites/facebook.test.ts / relay-ig.test.ts / relay-x.test.ts.
 */
import { resolve, REGISTRY } from '@/extension/shared/resolvers';
import { ingestSniffedFbMedia, __resetFbResolver } from '@/extension/shared/resolvers/sites/facebook';

beforeEach(() => {
  __resetFbResolver();
});

describe('REGISTRY order — facebookResolver', () => {
  it('is registered after instagram and before generic', () => {
    const ids = REGISTRY.map((r) => r.id);
    expect(ids).toContain('facebook');
    expect(ids.indexOf('instagram')).toBeLessThan(ids.indexOf('facebook'));
    expect(ids.indexOf('facebook')).toBeLessThan(ids.indexOf('generic'));
  });
});

describe('resolve — routes fbcdn media on facebook.com to facebookResolver', () => {
  it('returns the seeded original for an fbcdn thumbnail on a facebook.com photo page', () => {
    ingestSniffedFbMedia([{ fbid: '100', kind: 'image', url: 'https://x.fbcdn.net/orig_n.jpg', ext: 'jpg', width: 2048, height: 1536 }]);
    const out = resolve('https://x.fbcdn.net/a_n.jpg', {
      allowNetwork: false,
      pageUrl: 'https://www.facebook.com/photo/?fbid=100',
    });
    expect(out).toEqual([{ url: 'https://x.fbcdn.net/orig_n.jpg', kind: 'image', ext: 'jpg', width: 2048, height: 1536 }]);
  });
});
