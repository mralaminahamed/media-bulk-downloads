import { ResolveHint } from '@/types';

export interface MediaCandidate {
  url: string;
  kind: 'image' | 'video' | 'gif';
  ext?: string;
  thumbnailSrc?: string;
  poster?: string;
  resolveHint?: ResolveHint;
  unresolvedVideo?: boolean;
  /** True intrinsic dimensions when a resolver reads them from the DOM
   *  (e.g. Wallhaven's grid resolution label). Preferred over thumbnail dims. */
  width?: number;
  height?: number;
  /** Stable identity of the underlying media, supplied by a resolver that can
   *  recognise the same item across renditions (e.g. a Facebook photo's fbid,
   *  shared by its grid thumbnail and its full-res original). Lets a cross-scan
   *  merge upgrade-replace a rendition instead of adding a duplicate row. */
  mediaKey?: string;
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
