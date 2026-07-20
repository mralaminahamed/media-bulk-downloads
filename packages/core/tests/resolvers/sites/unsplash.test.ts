import { unsplashResolver } from '@mbd/core/resolvers/sites/unsplash';

const ctx = { allowNetwork: false };
const one = (s: string) => unsplashResolver.resolve(new URL(s), ctx)[0];

describe('unsplashResolver', () => {
  it('strips resize + format params on images.unsplash.com', () => {
    expect(one('https://images.unsplash.com/photo-123?ixid=abc&w=400&q=80&fm=webp&auto=format&fit=crop').url)
      .toBe('https://images.unsplash.com/photo-123?ixid=abc');
  });
  it('leaves a signed URL untouched — the imgix s= signature covers the whole query, so stripping size keys would 403', () => {
    const input = 'https://plus.unsplash.com/premium_photo-9?w=400&dpr=2&q=80&s=SIGNATURE';
    const r = one(input);
    expect(r.url).toBe(input);
    expect(r.thumbnailSrc).toBeUndefined();
  });
  it('reports ext:jpg (Unsplash originals are JPEG, URL has no path extension)', () => {
    expect(one('https://images.unsplash.com/photo-123?w=400&fm=webp').ext).toBe('jpg');
  });
  it('tags a shortid hint when a /photos/<shortid> link is near the element', () => {
    document.body.innerHTML = `<a href="/photos/xyz789"><img src="https://images.unsplash.com/photo-1?w=200"></a>`;
    const img = document.querySelector('img')!;
    const r = unsplashResolver.resolve(new URL('https://images.unsplash.com/photo-1?w=200'), { el: img, allowNetwork: false })[0];
    expect(r.resolveHint).toEqual({ platform: 'unsplash', id: 'xyz789' });
  });
  it('sets no thumbnailSrc when nothing is stripped (output URL equals the input)', () => {
    const r = one('https://images.unsplash.com/photo-abc');
    expect(r.url).toBe('https://images.unsplash.com/photo-abc');
    expect(r.thumbnailSrc).toBeUndefined();
    expect(r.resolveHint).toBeUndefined();
  });
});
