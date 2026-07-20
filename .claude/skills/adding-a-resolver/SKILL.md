---
name: adding-a-resolver
description: Add or modify a platform/CDN media resolver (upgrade a thumbnail URL to its original, recognize a video poster, or fetch an exact original). Use when adding support for a new site (Twitter/X, Unsplash, Wallhaven, Pinterest, Shopify, etc.), fixing a wrong "original" URL, or touching packages/core/src/resolvers or imageUrl.ts.
---

# Adding a media resolver

The collection engine turns a raw URL into `MediaCandidate[]`. Two layers:

1. **Generic upgrades** — `packages/core/src/collection/imageUrl.ts`:
   `deproxy()` (unwrap Next.js/weserv/Cloudinary), `upgradeToOriginal()` (rewrite
   CDN thumbnails to full size), `parseUrlDimensions()`, `detectType()`,
   `looksLikeMediaUrl()`. Add host-agnostic CDN rules here.
2. **Platform resolvers** — `packages/core/src/resolvers/`. The registry in
   `index.ts` runs platform resolvers first, then the generic one last (31 entries:
   30 dedicated + `generic`; ~64 modules under `sites/` counting page-readers +
   network-tier handlers).

## Recon FIRST — is it even worth a resolver?

Before writing anything, **recon-probe the live site** and build only if there's a
real upgrade path the generic pipeline misses. Most "add site X" ideas die here —
that is the point (the CDN sweep killed 5 of 8 probed).

- **curl a real post/media URL** and confirm a *bigger* original is reachable;
  compare bytes (small variant vs candidate original). No bigger reachable file →
  **close it**, don't build.
- **The generic pipeline is strong.** `bestSrcsetUrl` already returns the widest
  `srcset`/`<picture>` candidate and `upgradeToOriginal()` covers ~60 CDN families.
  If the page's largest *listed* rendition is the biggest that exists, a resolver
  adds nothing. (Tumblr: each size has its own filename, so an unlisted larger size
  is unreachable, and the widest `srcset` entry is the CDN cap — generic already
  wins, so **no resolver**.)
- **Signed / already-original** URLs can't be upgraded — leave them (running "open,
  not upgradeable" list: `docs/benchmark/gaps.md`).
- Prefer a **host-agnostic CDN rule** in `imageUrl.ts` when a plain path/param
  rewrite curl-verifies bigger; a full resolver only when you must read DOM/JSON.
  Record the outcome (shipped, or closed + why) in `docs/benchmark/changelog.md`.

## The Resolver contract (`resolvers/types.ts`)

```ts
interface Resolver {
  id: string;
  hosts?: string[];   // registrable domains → registry host-index bucket; omit = host-agnostic (tried as fallback)
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

## Three things the newer resolvers do differently

- **Read the widest rendition the page already lists — never fabricate a size.**
  When a CDN signs each width separately (a dimension rewrite 404s) but the page
  offers several sizes of the same image, read the element's `srcset` / `<picture>`
  `<source>`s and return the **widest same-image** rendition, keyed so every width
  folds to one row. Der Spiegel (`sites/spiegel.ts`) and Onedio (`sites/onedio.ts`)
  do exactly this — only URLs the page listed, never a downgrade, no network, no
  rewrite.
- **Gate on the right host.** `match` usually checks `u.hostname` (the media URL).
  But when the site page and the media CDN are *different* hosts, gate on
  **`ctx.pageUrl`**'s host instead. Booru resolvers
  (`resolvers/sites/booru.ts`) do this: the collected URL is the image CDN, so
  they allowlist `ctx.pageUrl`'s host and read the original off `ctx.el` (the post
  DOM: Danbooru's `data-file-url`, Gelbooru/Moebooru's original link). Mastodon
  (`mastodon.ts`) is host-agnostic the other way — it matches the
  `/media_attachments/files/` path on any instance, then rewrites `/small/` →
  `/original/`.
- **Video embeds are wired in `content/collect.ts`, not the registry.** An
  `<iframe>`/anchor embed (Vimeo, Dailymotion) has no on-page `<img>`/`<video>`, so
  a `pushX` helper in `collect.ts` (e.g. `pushDailymotion`, mirroring `pushVimeo`)
  emits `unresolvedVideo: true` + `resolveHint: { platform, id }`; the real stream
  is fetched in **Phase-2 `resolvers/network.ts`** (Dailymotion: `player/metadata`
  → the `qualities.auto` HLS master, host-pinned). Add the platform to
  `ResolvePlatform` in `packages/core/src/types.ts` when you add a case.

## Rules

- Only http(s) surfaces — the registry entry drops non-http(s) schemes; don't
  re-add them.
- Shape-validate any page-controlled value (e.g. a `data-*` id) before putting it
  in a URL path (`/^[a-z0-9]+$/i`).
- Add tests in `packages/core/tests/resolvers/sites/<site>.test.ts` (call the
  resolver directly) and, for collection wiring, `apps/extension/tests/unit/extension/content/collect.test.ts`.
- Verify live: bundle the real `collectMedia()` into an IIFE exposing
  `window.__bench` via a Vite/esbuild lib build, inject it into the target page
  with the browser javascript tool, and run it once. Strip query strings from any
  sample output (the safety filter blocks raw tokens). Record coverage in
  `docs/BENCHMARK.md`.

## References

**Self-contained (start here — the required data lives in-repo):**
- `references/recon-and-cdn.md` — the recon-probe recipe, `imageUrl.ts` CDN-rule
  mechanics, URL/`srcset` API essentials, and the host-pin/SSRF pattern.
- `references/worked-example.md` — a real DOM-`srcset`-widest resolver (Der Spiegel)
  walked through end to end, and when to copy it vs. a CDN rule / page-JSON reader /
  Phase-2 fetch.

**In-repo source:**
- Collection pipeline (this repo) — `docs/guides/collection-pipeline.md`,
  `docs/guides/resolve-originals.md` (the opt-in network tier), `docs/BENCHMARK.md`
- Benchmark detail (this repo) — `docs/benchmark/gaps.md` (open/unupgradeable),
  `docs/benchmark/changelog.md` (shipped/closed log), `docs/benchmark/coverage-matrix.md`
- Resolver source — `packages/core/src/resolvers/index.ts` (the `REGISTRY`),
  `resolvers/sites/*.ts`, `resolvers/network.ts` (Phase-2), `resolvers/sniffers/*`
  (MAIN-world fetch/XHR extractors), and `collection/imageUrl.ts` (CDN rules)
- Wiring tests — `packages/core/tests/resolvers/sites/*.test.ts`,
  `apps/extension/tests/unit/extension/content/collect.test.ts`
- Acknowledgement policy — README §Acknowledgements: gallery-dl is a **factual
  reference only** (endpoints / URL shapes); never copy its GPL source

**Further reading (external, optional — not required; captured above):**
- URL API — https://developer.mozilla.org/en-US/docs/Web/API/URL
- `srcset` / responsive images — https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#srcset
- fetch() (network tier runs in the background worker) — https://developer.mozilla.org/en-US/docs/Web/API/fetch
- Content scripts read the page DOM — https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- curl (recon-probing originals) — https://curl.se/docs/manpage.html
- HLS / DASH (stream masters some resolvers return) — https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Streaming

Related skills: `testing-and-verifying` (Vitest patterns + the browser preview
harness), `extension-dev` (where a resolver file belongs). Process skills (global):
`superpowers:test-driven-development` (failing test first), `superpowers:systematic-debugging`
(a wrong "original"), `superpowers:verification-before-completion` (before shipping).
