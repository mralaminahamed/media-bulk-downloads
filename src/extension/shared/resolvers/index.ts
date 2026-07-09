import { MediaCandidate, Resolver, ResolveContext } from './types';
import { artstationResolver } from './sites/artstation';
import { behanceResolver } from './sites/behance';
import { bskyResolver } from './sites/bsky';
import { flickrResolver } from './sites/flickr';
import { genericResolver } from './sites/generic';
import { instagramResolver } from './sites/instagram';
import { magnificResolver } from './sites/magnific';
import { pinterestResolver } from './sites/pinterest';
import { redditResolver } from './sites/reddit';
import { twitterResolver } from './sites/twitter';
import { unsplashResolver } from './sites/unsplash';
import { wallhavenResolver } from './sites/wallhaven';
import { youtubeResolver } from './sites/youtube';

export const REGISTRY: Resolver[] = [twitterResolver, instagramResolver, unsplashResolver, wallhavenResolver, behanceResolver, bskyResolver, pinterestResolver, redditResolver, flickrResolver, artstationResolver, magnificResolver, youtubeResolver, genericResolver];

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
