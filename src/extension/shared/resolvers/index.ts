import { MediaCandidate, Resolver, ResolveContext } from './types';
import { genericResolver } from './generic';
import { twitterResolver } from './twitter';

export const REGISTRY: Resolver[] = [twitterResolver, genericResolver];

export function resolve(rawUrl: string, ctx: ResolveContext): MediaCandidate[] {
  let u: URL;
  try {
    u = new URL(rawUrl, document.baseURI);
  } catch {
    return [{ url: rawUrl, kind: 'image' }];
  }
  for (const r of REGISTRY) {
    if (r.match(u, ctx)) {
      const out = r.resolve(u, ctx);
      if (out.length) return out;
    }
  }
  return [{ url: u.href, kind: 'image' }];
}

export * from './types';
