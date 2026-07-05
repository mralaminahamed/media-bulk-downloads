import { resolve, REGISTRY } from '@/extension/shared/resolvers';

const ctx = { allowNetwork: false };

describe('resolve — generic fallback', () => {
  it('upgrades a known CDN URL via the generic resolver', () => {
    const [c] = resolve('https://i.ytimg.com/vi/ID/default.jpg', ctx);
    expect(c).toMatchObject({ kind: 'image', url: 'https://i.ytimg.com/vi/ID/hqdefault.jpg' });
    expect(c.thumbnailSrc).toBe('https://i.ytimg.com/vi/ID/default.jpg');
  });
  it('returns identity image candidate for a plain URL', () => {
    expect(resolve('https://ex.com/a.jpg', ctx)).toEqual([{ url: 'https://ex.com/a.jpg', kind: 'image' }]);
  });
  it('returns no candidates for a malformed URL', () => {
    // 'http://' is genuinely unparseable even with jsdom's baseURI present, so it
    // exercises the catch path. An unparseable URL is not media — no candidate.
    expect(resolve('http://', ctx)).toEqual([]);
  });

  it('returns no candidates for non-http schemes (javascript:/data:text/file:)', () => {
    expect(resolve('javascript:alert(1)', ctx)).toEqual([]);
    expect(resolve('data:text/html,<script>1</script>', ctx)).toEqual([]);
    expect(resolve('file:///etc/passwd', ctx)).toEqual([]);
  });

  it('includes behanceResolver before genericResolver', () => {
    const ids = REGISTRY.map((r) => r.id);
    expect(ids).toContain('behance');
    expect(ids.indexOf('behance')).toBeLessThan(ids.indexOf('generic'));
  });
});
