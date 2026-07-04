import { ResolveHint } from '@/types';

export interface MediaCandidate {
  url: string;
  kind: 'image' | 'video' | 'gif';
  ext?: string;
  thumbnailSrc?: string;
  poster?: string;
  resolveHint?: ResolveHint;
  unresolvedVideo?: boolean;
}

export interface ResolveContext {
  el?: Element;
  allowNetwork: boolean;
  /** The page's own URL. Lets a resolver recover a status id when no nearby
   *  /status/ link exists (e.g. a single-tweet detail page). */
  pageUrl?: string;
}

export interface Resolver {
  id: string;
  match(u: URL, ctx: ResolveContext): boolean;
  /** Tier A/B, synchronous, network-free. [] means "not mine / give up". */
  resolve(u: URL, ctx: ResolveContext): MediaCandidate[];
}
