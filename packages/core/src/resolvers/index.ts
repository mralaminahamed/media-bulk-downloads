import { MediaCandidate, Resolver, ResolveContext } from './types';
import { arcxpResolver } from './sites/arcxp';
import { artstationResolver } from './sites/artstation';
import { behanceResolver } from './sites/behance';
import { booruResolver } from './sites/booru';
import { bskyResolver } from './sites/bsky';
import { facebookResolver } from './sites/facebook';
import { flickrResolver } from './sites/flickr';
import { genericResolver } from './sites/generic';
import { instagramResolver } from './sites/instagram';
import { magnificResolver } from './sites/magnific';
import { mastodonResolver } from './sites/mastodon';
import { pinterestResolver } from './sites/pinterest';
import { redditResolver } from './sites/reddit';
import { threadsResolver } from './sites/threads';
import { twitterResolver } from './sites/twitter';
import { unsplashResolver } from './sites/unsplash';
import { wallhavenResolver } from './sites/wallhaven';
import { youtubeResolver } from './sites/youtube';

export const REGISTRY: Resolver[] = [twitterResolver, instagramResolver, facebookResolver, threadsResolver, unsplashResolver, wallhavenResolver, behanceResolver, bskyResolver, pinterestResolver, redditResolver, flickrResolver, artstationResolver, magnificResolver, arcxpResolver, youtubeResolver, mastodonResolver, booruResolver, genericResolver];

// Suffix → resolvers that declared it, preserving REGISTRY order within a bucket.
const hostIndex = new Map<string, Resolver[]>();
// Resolvers with no `hosts` (matched by path / ctx / id), tried after any bucket.
const fallback: Resolver[] = [];
let indexBuilt = false;

// Deferred to first use rather than run at module-evaluation time: this module
// sits inside a circular import (a sites/*.ts resolver -> shared/collection/
// imageUrl -> content/collect -> this barrel -> back to that same sites/*.ts),
// and several resolver unit tests import a sites/*.ts module directly instead
// of through this barrel. That entry point re-enters this file mid-cycle,
// before every REGISTRY resolver import has finished initializing — building
// the index there would bake in an undefined REGISTRY slot. Building it lazily
// on first call means it only ever runs once the whole module graph (and every
// REGISTRY entry) has finished loading.
function buildIndex(): void {
  if (indexBuilt) return;
  indexBuilt = true;
  for (const r of REGISTRY) {
    if (r.hosts && r.hosts.length) {
      for (const suffix of r.hosts) {
        const bucket = hostIndex.get(suffix);
        if (bucket) bucket.push(r);
        else hostIndex.set(suffix, [r]);
      }
    } else {
      fallback.push(r);
    }
  }
}

// hostname → itself + every parent suffix: 'a.b.cdninstagram.com' yields
// ['a.b.cdninstagram.com','b.cdninstagram.com','cdninstagram.com','com'].
function suffixKeys(hostname: string): string[] {
  const labels = hostname.split('.');
  const keys: string[] = [];
  for (let i = 0; i < labels.length; i++) keys.push(labels.slice(i).join('.'));
  return keys;
}

// Resolvers to try for a URL: host-indexed matches (REGISTRY order, de-duped)
// then the host-agnostic fallback. Narrows the candidate set; match() still gates.
function candidatesFor(u: URL): Resolver[] {
  buildIndex();
  const picked = new Set<Resolver>();
  for (const key of suffixKeys(u.hostname)) {
    const bucket = hostIndex.get(key);
    if (bucket) for (const r of bucket) picked.add(r);
  }
  const ordered = REGISTRY.filter((r) => picked.has(r));
  return ordered.concat(fallback);
}

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
  for (const r of candidatesFor(u)) {
    if (r.match(u, ctx)) {
      const out = r.resolve(u, ctx);
      if (out.length) return out;
    }
  }
  return [{ url: u.href, kind: 'image' }];
}

export * from './types';
