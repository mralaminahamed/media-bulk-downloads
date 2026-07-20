import { MediaCandidate, Resolver } from '@mbd/core/resolvers/types';

const STRIP = ['w','h','fit','resize','q','quality','dpr','crop','ar','cs','fm','auto','bg','blend','blend-mode','blend-alpha','ixlib'];
const PLUS_STRIP = ['w','h','dpr','fit','crop'];

export const unsplashResolver: Resolver = {
  id: 'unsplash',
  hosts: ['unsplash.com'],
  match: (u) => /(?:^|\.)(?:images|plus)\.unsplash\.com$/.test(u.hostname),
  resolve: (u, ctx): MediaCandidate[] => {
    const input = u.href;
    const out = new URL(u.href);
    if (!out.searchParams.has('s')) {
      const keys = out.hostname === 'plus.unsplash.com' ? PLUS_STRIP : STRIP;
      keys.forEach((k) => out.searchParams.delete(k));
    }
    const c: MediaCandidate = { url: out.href, kind: 'image', ext: 'jpg' };
    if (out.href !== input) c.thumbnailSrc = input;
    const link = ctx.el?.closest?.('a[href*="/photos/"]') as HTMLAnchorElement | null;
    const sid = link?.getAttribute('href')?.match(/\/photos\/([A-Za-z0-9_-]+)/)?.[1];
    if (sid) c.resolveHint = { platform: 'unsplash', id: sid };
    return [c];
  },
};
