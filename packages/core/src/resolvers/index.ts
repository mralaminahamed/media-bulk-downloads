import { MediaCandidate, Resolver, ResolveContext } from '@mbd/core/resolvers/types';
import { animePicturesResolver } from '@mbd/core/resolvers/sites/animepictures';
import { arcxpResolver } from '@mbd/core/resolvers/sites/arcxp';
import { artstationResolver } from '@mbd/core/resolvers/sites/artstation';
import { behanceResolver } from '@mbd/core/resolvers/sites/behance';
import { booruResolver } from '@mbd/core/resolvers/sites/booru';
import { bskyResolver } from '@mbd/core/resolvers/sites/bsky';
import { facebookResolver } from '@mbd/core/resolvers/sites/facebook';
import { flickrResolver } from '@mbd/core/resolvers/sites/flickr';
import { foolfuukaResolver } from '@mbd/core/resolvers/sites/foolfuuka';
import { fourchanResolver } from '@mbd/core/resolvers/sites/fourchan';
import { genericResolver } from '@mbd/core/resolvers/sites/generic';
import { instagramResolver } from '@mbd/core/resolvers/sites/instagram';
import { magnificResolver } from '@mbd/core/resolvers/sites/magnific';
import { mastodonResolver } from '@mbd/core/resolvers/sites/mastodon';
import { onedioResolver } from '@mbd/core/resolvers/sites/onedio';
import { pikabuResolver } from '@mbd/core/resolvers/sites/pikabu';
import { pinterestResolver } from '@mbd/core/resolvers/sites/pinterest';
import { pixivResolver } from '@mbd/core/resolvers/sites/pixiv';
import { postimagesResolver } from '@mbd/core/resolvers/sites/postimages';
import { redditResolver } from '@mbd/core/resolvers/sites/reddit';
import { sankakuResolver } from '@mbd/core/resolvers/sites/sankaku';
import { spiegelResolver } from '@mbd/core/resolvers/sites/spiegel';
import { xiaohongshuResolver } from '@mbd/core/resolvers/sites/xiaohongshu';
import { threadsResolver } from '@mbd/core/resolvers/sites/threads';
import { twitterResolver } from '@mbd/core/resolvers/sites/twitter';
import { unsplashResolver } from '@mbd/core/resolvers/sites/unsplash';
import { wallhavenResolver } from '@mbd/core/resolvers/sites/wallhaven';
import { wallpaperHostsResolver } from '@mbd/core/resolvers/sites/wallpaperhosts';
import { wallpaperscraftResolver } from '@mbd/core/resolvers/sites/wallpaperscraft';
import { youtubeResolver } from '@mbd/core/resolvers/sites/youtube';
import { zerochanResolver } from '@mbd/core/resolvers/sites/zerochan';

export const REGISTRY: Resolver[] = [twitterResolver, instagramResolver, facebookResolver, threadsResolver, unsplashResolver, wallhavenResolver, behanceResolver, bskyResolver, pinterestResolver, redditResolver, flickrResolver, artstationResolver, pixivResolver, magnificResolver, arcxpResolver, youtubeResolver, mastodonResolver, booruResolver, zerochanResolver, wallpaperscraftResolver, sankakuResolver, postimagesResolver, fourchanResolver, foolfuukaResolver, pikabuResolver, wallpaperHostsResolver, xiaohongshuResolver, spiegelResolver, onedioResolver, animePicturesResolver, genericResolver];

const hostIndex = new Map<string, Resolver[]>();
const fallback: Resolver[] = [];
let indexBuilt = false;

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

function suffixKeys(hostname: string): string[] {
  const labels = hostname.split('.');
  const keys: string[] = [];
  for (let i = 0; i < labels.length; i++) keys.push(labels.slice(i).join('.'));
  return keys;
}

const candidatesCache = new Map<string, Resolver[]>();
function candidatesFor(u: URL): Resolver[] {
  buildIndex();
  const cached = candidatesCache.get(u.hostname);
  if (cached) return cached;
  const picked = new Set<Resolver>();
  for (const key of suffixKeys(u.hostname)) {
    const bucket = hostIndex.get(key);
    if (bucket) for (const r of bucket) picked.add(r);
  }
  const ordered = REGISTRY.filter((r) => picked.has(r)).concat(fallback);
  candidatesCache.set(u.hostname, ordered);
  return ordered;
}

export function resolve(rawUrl: string, ctx: ResolveContext): MediaCandidate[] {
  let u: URL;
  try {
    u = new URL(rawUrl, document.baseURI);
  } catch {
    return [];
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return [];
  for (const r of candidatesFor(u)) {
    if (r.match(u, ctx)) {
      const out = r.resolve(u, ctx);
      if (out.length) return out;
    }
  }
  return [{ url: u.href, kind: 'image' }];
}

export * from '@mbd/core/resolvers/types';
