import { MediaCandidate, Resolver } from '../types';

const STRIP = ['w','h','fit','resize','q','quality','dpr','crop','ar','cs','fm','auto','bg','blend','blend-mode','blend-alpha','ixlib'];
const PLUS_STRIP = ['w','h','dpr','fit','crop'];

export const unsplashResolver: Resolver = {
  id: 'unsplash',
  hosts: ['unsplash.com'],
  match: (u) => /(?:^|\.)(?:images|plus)\.unsplash\.com$/.test(u.hostname),
  resolve: (u, ctx): MediaCandidate[] => {
    const input = u.href;
    const out = new URL(u.href);
    // `s` is the imgix secure-URL signature, computed over the ENTIRE query.
    // Deleting size params from a signed URL invalidates it (403) — so leave a
    // signed URL exactly as the page served it (already the widest we can get
    // without re-signing, which we never do). Unsplash+ (plus.unsplash.com) is
    // always signed; public images.unsplash.com URLs are not.
    if (!out.searchParams.has('s')) {
      const keys = out.hostname === 'plus.unsplash.com' ? PLUS_STRIP : STRIP;
      keys.forEach((k) => out.searchParams.delete(k));
    }
    // Unsplash originals are JPEG and the stripped URL carries no path extension,
    // so name the resolver's format explicitly.
    const c: MediaCandidate = { url: out.href, kind: 'image', ext: 'jpg' };
    if (out.href !== input) c.thumbnailSrc = input;
    const link = ctx.el?.closest?.('a[href*="/photos/"]') as HTMLAnchorElement | null;
    const sid = link?.getAttribute('href')?.match(/\/photos\/([A-Za-z0-9_-]+)/)?.[1];
    if (sid) c.resolveHint = { platform: 'unsplash', id: sid };
    return [c];
  },
};
