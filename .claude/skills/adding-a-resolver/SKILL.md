---
name: adding-a-resolver
description: Add or modify a platform/CDN media resolver (upgrade a thumbnail URL to its original, recognize a video poster, or fetch an exact original). Use when adding support for a new site (Twitter/X, Unsplash, Wallhaven, Pinterest, Shopify, etc.), fixing a wrong "original" URL, or touching src/extension/shared/resolvers or imageUrl.ts.
---

# Adding a media resolver

The collection engine turns a raw URL into `MediaCandidate[]`. Two layers:

1. **Generic upgrades** — `src/extension/shared/collection/imageUrl.ts`:
   `deproxy()` (unwrap Next.js/weserv/Cloudinary), `upgradeToOriginal()` (rewrite
   CDN thumbnails to full size), `parseUrlDimensions()`, `detectType()`,
   `looksLikeMediaUrl()`. Add host-agnostic CDN rules here.
2. **Platform resolvers** — `src/extension/shared/resolvers/`. The registry in
   `index.ts` runs platform resolvers first, then the generic one last.

## The Resolver contract (`resolvers/types.ts`)

```ts
interface Resolver {
  id: string;
  match(u: URL, ctx: ResolveContext): boolean;   // exact hostname === checks, not substring
  resolve(u: URL, ctx: ResolveContext): MediaCandidate[]; // synchronous, network-free; [] = "not mine"
}
interface ResolveContext { el?: Element; allowNetwork: boolean; pageUrl?: string }
interface MediaCandidate {
  url: string; kind: 'image' | 'video' | 'gif'; ext?: string;
  thumbnailSrc?: string; poster?: string;
  width?: number; height?: number; // resolver-known intrinsic dims (preferred over thumbnail dims)
  resolveHint?: ResolveHint;      // { platform, id } → opt-in network resolve
  unresolvedVideo?: boolean;      // poster-only pending video; never displayed until resolved
  mediaKey?: string;              // stable cross-rendition identity (e.g. `fb:<fbid>`) so a
                                  // deep-scan upgrade-replaces a rendition instead of duplicating
}
```

## Steps to add one

1. Create `resolvers/<site>.ts` exporting a `Resolver`. `match` on exact
   `u.hostname`. In `resolve`, return upgraded candidates or `[]`.
2. Register it in `resolvers/index.ts` `REGISTRY` (before `genericResolver`).
3. For a **video whose poster is an `<img>`** (no `<video>` element), emit a
   `kind: 'video'` candidate with `unresolvedVideo: true` and a
   `resolveHint: { platform, id }` read from the cell's `/status/` link via
   `ctx.el`. Never fall through to an image (it would leak a still frame).
4. For an **exact original that needs a network fetch** (opt-in
   `resolveOriginals`), add a case in `resolvers/network.ts`. **Pin the result**:
   `encodeURIComponent` the id before interpolating, and constrain the returned
   URL to `https` + the expected host family (`pinnedUrl(url, 'host.com')`) —
   API JSON is untrusted.

## Rules

- Only http(s) surfaces — the registry entry drops non-http(s) schemes; don't
  re-add them.
- Shape-validate any page-controlled value (e.g. a `data-*` id) before putting it
  in a URL path (`/^[a-z0-9]+$/i`).
- Add tests in `tests/unit/extension/shared/resolvers/<site>.test.ts` (call the
  resolver directly) and, for collection wiring, `tests/unit/extension/content/collect.test.ts`.
- Verify live: bundle the real `collectMedia()` into an IIFE exposing
  `window.__bench` via a Vite/esbuild lib build, inject it into the target page
  with the browser javascript tool, and run it once. Strip query strings from any
  sample output (the safety filter blocks raw tokens). Record coverage in
  `docs/BENCHMARK.md`.

## References

- Collection pipeline (this repo) — `docs/guides/collection-pipeline.md`,
  `docs/BENCHMARK.md`
- Resolver source — `src/extension/shared/resolvers/` and `imageUrl.ts`
- URL API — https://developer.mozilla.org/en-US/docs/Web/API/URL
- fetch() (network tier runs in the background worker) — https://developer.mozilla.org/en-US/docs/Web/API/fetch
- Content scripts read the page DOM — https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts

Related skill: `testing-and-verifying` (Vitest patterns + the browser preview
harness) — optional; this skill stands on its own.
