export interface MediaCandidate {
  url: string;
  kind: 'image' | 'video' | 'gif';
  ext?: string;
  thumbnailSrc?: string;
  poster?: string;
}

export interface ResolveContext {
  el?: Element;
  allowNetwork: boolean;
}

export interface Resolver {
  id: string;
  match(u: URL, ctx: ResolveContext): boolean;
  /** Tier A/B, synchronous, network-free. [] means "not mine / give up". */
  resolve(u: URL, ctx: ResolveContext): MediaCandidate[];
}
