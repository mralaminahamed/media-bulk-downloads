import { unsplashResolver } from '@/extension/shared/resolvers/unsplash';

const ctx = { allowNetwork: false };
const one = (s: string) => unsplashResolver.resolve(new URL(s), ctx)[0];

describe('unsplashResolver', () => {
  it('strips resize + format params on images.unsplash.com', () => {
    expect(one('https://images.unsplash.com/photo-123?ixid=abc&w=400&q=80&fm=webp&auto=format&fit=crop').url)
      .toBe('https://images.unsplash.com/photo-123?ixid=abc');
  });
  it('plus.unsplash.com keeps signature/q, drops only size keys', () => {
    const r = one('https://plus.unsplash.com/premium_photo-9?w=400&dpr=2&q=80&s=SIGNATURE');
    expect(r.url).toBe('https://plus.unsplash.com/premium_photo-9?q=80&s=SIGNATURE');
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
});
