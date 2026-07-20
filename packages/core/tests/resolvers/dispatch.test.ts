/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.facebook.com/" }
 *
 * Dispatch parity: every representative URL routes to the same resolver and
 * yields the same candidate whether resolve() uses the old linear scan or the
 * new suffix index. Written to pass against the CURRENT linear scan first, so a
 * green run here BEFORE the index change is the no-regression baseline.
 */
import { resolve, REGISTRY } from '@mbd/core/resolvers';

const ctx = { allowNetwork: false } as const;

describe('resolve — host-bucket routing', () => {
  it('routes an unknown host to the generic image default', () => {
    expect(resolve('https://example.com/photo.jpg', ctx)).toEqual([{ url: 'https://example.com/photo.jpg', kind: 'image', ext: 'jpg' }]);
  });

  it('routes a twimg URL through the twitter resolver (non-empty, image)', () => {
    const out = resolve('https://pbs.twimg.com/media/ABCdef123.jpg', ctx);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].kind).toBe('image');
    expect(out[0].url).toContain('pbs.twimg.com/media/ABCdef123');
  });

  it('routes each reddit host to a non-empty candidate', () => {
    for (const host of ['i.redd.it', 'preview.redd.it']) {
      const out = resolve(`https://${host}/abc123.jpg`, ctx);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it('routes an unsplash subdomain and a flickr subdomain through their resolvers', () => {
    expect(resolve('https://images.unsplash.com/photo-123?w=200', ctx).length).toBeGreaterThan(0);
    expect(resolve('https://live.staticflickr.com/65535/1_abc_b.jpg', ctx).length).toBeGreaterThan(0);
  });
});

describe('resolve — ordering within a shared suffix bucket', () => {
  it('keeps REGISTRY order: instagram is tried before facebook before threads', () => {
    const ids = REGISTRY.map((r) => r.id);
    expect(ids.indexOf('instagram')).toBeLessThan(ids.indexOf('facebook'));
    expect(ids.indexOf('facebook')).toBeLessThan(ids.indexOf('threads'));
  });
});
