import { ingestSniffedFbMedia, __resetFbResolver, __storeSize, facebookResolver } from '@/extension/shared/resolvers/sites/facebook';

beforeEach(() => __resetFbResolver());

describe('ingestSniffedFbMedia', () => {
  it('stores valid entries without throwing (store grows by the clean count)', () => {
    expect(() =>
      ingestSniffedFbMedia([
        { fbid: '100', kind: 'image', url: 'https://x.fbcdn.net/orig_n.jpg', ext: 'jpg', width: 2048, height: 1536 },
        { fbid: '101', kind: 'video', url: 'https://x.fbcdn.net/clip_n.mp4', ext: 'mp4', width: 1280, height: 720 },
      ]),
    ).not.toThrow();
    expect(__storeSize()).toBe(2);
  });

  it('rejects a forged batch: non-fbcdn host, non-digit fbid, off-allowlist ext', () => {
    ingestSniffedFbMedia([
      { fbid: '101', kind: 'image', url: 'https://evil.com/x.jpg', ext: 'jpg', width: 9, height: 9 }, // bad host
      { fbid: 'abc', kind: 'image', url: 'https://x.fbcdn.net/x_n.jpg', ext: 'jpg', width: 9, height: 9 }, // bad fbid
      { fbid: '102', kind: 'image', url: 'https://x.fbcdn.net/x_n.exe', ext: 'exe', width: 9, height: 9 }, // fine: ext off-allowlist just falls back to default, not rejected on its own
    ]);
    // Only the third entry (valid host + valid fbid) survives; its off-allowlist ext
    // falls back to the kind default ('jpg') rather than smuggling 'exe' through.
    expect(__storeSize()).toBe(1);
  });

  it('rejects entries with a bad kind and non-array payloads without throwing', () => {
    expect(() => ingestSniffedFbMedia(null)).not.toThrow();
    expect(() => ingestSniffedFbMedia('not-an-array')).not.toThrow();
    expect(__storeSize()).toBe(0);

    ingestSniffedFbMedia([{ fbid: '200', kind: 'audio', url: 'https://x.fbcdn.net/a.mp3', ext: 'mp3' }]);
    expect(__storeSize()).toBe(0);
  });

  it('bounds the store to its cap (newest entries win)', () => {
    const many = Array.from({ length: 4001 }, (_, i) => ({
      fbid: '300', kind: 'image', url: `https://x.fbcdn.net/MANY_${i}_n.jpg`, ext: 'jpg', width: 1440, height: 1440,
    }));
    ingestSniffedFbMedia(many);
    expect(__storeSize()).toBe(4000); // 4001 ingested, capped to the last 4000
  });
});

describe('facebookResolver (Task 4 stub)', () => {
  it('never claims a URL and always resolves to nothing (real logic lands in Task 5)', () => {
    expect(facebookResolver.match(new URL('https://x.fbcdn.net/a.jpg'), { allowNetwork: false })).toBe(false);
    expect(facebookResolver.resolve(new URL('https://x.fbcdn.net/a.jpg'), { allowNetwork: false })).toEqual([]);
  });
});
