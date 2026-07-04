import { MediaCandidate, Resolver, ResolveContext } from './types';
import { genericResolver } from './generic';
import { twitterResolver } from './twitter';
import { unsplashResolver } from './unsplash';
import { wallhavenResolver } from './wallhaven';

export const REGISTRY: Resolver[] = [twitterResolver, unsplashResolver, wallhavenResolver, genericResolver];

export function resolve(rawUrl: string, ctx: ResolveContext): MediaCandidate[] {
  let u: URL;
  try {
    u = new URL(rawUrl, document.baseURI);
  } catch {
    return [];
  }
  // Only ever surface http(s) media. Any other scheme — javascript:, data:,
  // file:, blob:, chrome-extension: — must never become a candidate: it would
  // flow into MediaItem.src and reach an <a href> / tab-open sink downstream.
  // (data:image URLs are handled by the base64 path before resolve() runs.)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return [];
  for (const r of REGISTRY) {
    if (r.match(u, ctx)) {
      const out = r.resolve(u, ctx);
      if (out.length) return out;
    }
  }
  return [{ url: u.href, kind: 'image' }];
}

export * from './types';
