import { resolve, REGISTRY } from '@/extension/shared/resolvers';

const ctx = { allowNetwork: false };

describe('resolve — generic fallback', () => {
  it('upgrades a known CDN URL via the generic resolver', () => {
    const [c] = resolve('https://i.ytimg.com/vi/ID/default.jpg', ctx);
    expect(c).toMatchObject({ kind: 'image', url: 'https://i.ytimg.com/vi/ID/hqdefault.jpg' });
    expect(c.thumbnailSrc).toBe('https://i.ytimg.com/vi/ID/default.jpg');
  });
  it('returns identity image candidate for a plain URL, keeping the real extension', () => {
    expect(resolve('https://ex.com/a.jpg', ctx)).toEqual([{ url: 'https://ex.com/a.jpg', kind: 'image', ext: 'jpg' }]);
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

  it('includes bskyResolver before genericResolver', () => {
    const ids = REGISTRY.map((r) => r.id);
    expect(ids).toContain('bsky');
    expect(ids.indexOf('bsky')).toBeLessThan(ids.indexOf('generic'));
  });

  it('routes a cdn.bsky.app thumbnail through the bsky resolver, not the generic one', () => {
    const [c] = resolve('https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc/bafcid@jpeg', ctx);
    expect(c).toMatchObject({
      kind: 'image',
      url: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/bafcid@jpeg',
      resolveHint: { platform: 'bsky', id: 'blob did:plc:abc bafcid' },
    });
  });

  it('includes redditResolver before genericResolver', () => {
    const ids = REGISTRY.map((r) => r.id);
    expect(ids).toContain('reddit');
    expect(ids.indexOf('reddit')).toBeLessThan(ids.indexOf('generic'));
  });

  it('routes a preview.redd.it URL through the reddit resolver to the i.redd.it original', () => {
    const [c] = resolve('https://preview.redd.it/abc123.jpeg?width=640&s=deadbeef', ctx);
    expect(c).toMatchObject({ kind: 'image', url: 'https://i.redd.it/abc123.jpeg' });
    expect(c.thumbnailSrc).toBe('https://preview.redd.it/abc123.jpeg?width=640&s=deadbeef');
  });
});
