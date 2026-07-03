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
});
