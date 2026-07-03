import { MediaCandidate, Resolver } from './types';

const STRIP = ['w','h','fit','resize','q','quality','dpr','crop','ar','cs','fm','auto','bg','blend','blend-mode','blend-alpha','ixlib'];
const PLUS_STRIP = ['w','h','dpr','fit','crop'];

export const unsplashResolver: Resolver = {
  id: 'unsplash',
  match: (u) => /(?:^|\.)(?:images|plus)\.unsplash\.com$/.test(u.hostname),
  resolve: (u): MediaCandidate[] => {
    const input = u.href;
    const out = new URL(u.href);
    const keys = out.hostname === 'plus.unsplash.com' ? PLUS_STRIP : STRIP;
    keys.forEach((k) => out.searchParams.delete(k));
    const c: MediaCandidate = { url: out.href, kind: 'image' };
    if (out.href !== input) c.thumbnailSrc = input;
    return [c];
  },
};
