# Native Media Resolvers — Technical Analysis (Twitter/X, Unsplash, Wallhaven)

**Date:** 2026-07-03
**Status:** Analysis (opus). Feeds the native-resolvers design spec.

> Full opus analysis of how to resolve the original, highest-quality media URLs
> for Twitter/X, Unsplash, and Wallhaven — images and video, including Twitter
> multi-photo tweets — under the extension's network-free constraint.

## Tier model

- **A — Pure URL rewrite (network-free):** regex/param edit on the string alone.
- **B — DOM-derived (network-free):** the original URL or a decisive hint (real
  extension, media id) lives in a nearby element/attribute.
- **C — One network request:** HEAD/GET/redirect/`.m3u8` parse. Breaks the
  network-free default → must be explicit user opt-in.
- **D — Platform API / infeasible:** needs GraphQL/syndication, or DRM/segmented
  mux impractical for `chrome.downloads`.

## Twitter / X

**Images — `pbs.twimg.com/media/<ID>`:** grammars
`?format=<jpg|png|webp>&name=<size>` and legacy `.<ext>:<size>`. Sizes:
thumb 150 / small 680 / medium 1200 (default) / large 2048 / **orig 4096 (true
original, capped to 4096²)**. `format=` is a *transcode selector*, not the master;
`webp` is never a master → rewrite `webp`→`jpg`. Handle avatars
(`/profile_images/…_<size>.<ext>` → drop size), banners
(`/profile_banners/…/<WxH>` → drop size), `card_img`. Pre-strip legacy `:size`
before the query rewrite. **Tier A.**

**Multi-photo tweets (2/3/4):** each photo is a real `<img>` under
`div[data-testid="tweetPhoto"] > a[href=".../photo/<n>"]`. All photos of a
*mounted* tweet are present simultaneously; a blur-up `background-image`
placeholder of the same ID also exists — `name=orig` collapses placeholder+real
to one URL (free dedup). Do NOT dedup on `alt` (user text, often empty). Off-screen
tweets are unmounted (virtualized) → **Deep scan is mandatory** to surface them.
Dedup vs. other assets by pathname: keep `/media/` only; treat `/profile_images/`,
`/card_img/`, emoji (`abs*.twimg.com`) separately. **Tier B walk + A upgrade.**

**Video / GIF:** `<video>` uses a `blob:` MediaSource — the real URL is never in
the DOM, only the `poster`. GIFs are reconstructable network-free:
`tweet_video_thumb/<ID>.jpg` → `video.twimg.com/tweet_video/<ID>.mp4` (**Tier B**).
Real video progressive mp4 requires the unauthenticated syndication endpoint
`cdn.syndication.twimg.com/tweet-result?id=<statusId>&token=<any>` →
`mediaDetails[].video_info.variants[]`; pick max-bitrate `video/mp4` (**Tier C**;
statusId harvested from the `/status/<id>` link, Tier B). HLS-only/live/DRM →
**Tier D**, infeasible in-extension (needs ffmpeg.wasm mux). Keep the
`.m3u8`/`.mpd`/`blob:` skip as the honest default.

## Unsplash

`images.unsplash.com/photo-<id>?ixid&w&h&q&fm&fit&crop&dpr&auto`. Stripping the
transform params yields the full-res master in native format. **Extend the strip
list** beyond the current `w,h,fit,resize,q,dpr,crop` to also drop `fm`, `auto`,
`ar`, `cs`, `ixlib`, `bg`, `blend*` (else you keep a webp/png transcode).
`ixid` is droppable. **Tier A.** `unsplash.com/photos/<id>/download` 302-redirects
to the *same* master pixels + increments a counter — not higher-res, so the
stripped CDN URL is the recommended network-free original; `/download` is **Tier
C**, opt-in only. **plus.unsplash.com** (premium) URLs are signature-gated —
stripping can 403; only drop pure resize keys (`w,h,dpr,fit,crop`) and keep the
signature, or leave premium untouched. True premium original → **Tier D**.

## Wallhaven

`th.wallhaven.cc/{small|lg|orig}/<ab>/<id>.jpg` (thumb always `.jpg`, `<ab>` =
first 2 chars of id) → `w.wallhaven.cc/full/<ab>/wallhaven-<id>.<ext>` where
`ext ∈ {jpg,png,gif}`. The **extension is the whole problem** — not in the thumb
URL. Resolve it:
1. **Tier B** — on `/w/<id>` pages read `<img id="wallpaper" src=…full/…<ext>>`.
2. **Tier B** — on grids, the figure carries a PNG badge:
   `figure[data-wallpaper-id] > span.png` (and `span.gif`). `ext = span.png ? png
   : span.gif ? gif : jpg`. DOM-only, this is what the "Wallhaven Enhance"
   userscript does.
3. **Tier C** — bare thumb with no figure → `wallhaven.cc/api/v1/w/<id>`
   (`data.path`, `data.file_type`) or HEAD `.jpg`→`.png`→`.gif`.

**Never emit the blind-`.jpg` string transform as final** — it 404s on ~1/4 of
wallpapers (PNG/GIF). Make the Wallhaven rule DOM-aware, not a pure `CdnRule`.

## Recommended architecture

Refactor `upgradeToOriginal(url)` (Tier-A-only, context-free) into a **layered
resolver registry**:

```ts
interface ResolveContext { el?: Element; doc?: Document; allowNetwork: boolean; fetch?: typeof fetch; }
interface MediaCandidate { url: string; kind: 'image'|'video'|'gif'; quality?: number; ext?: string; needsNetwork?: boolean; }
interface Resolver {
  id: string;
  match(u: URL, ctx: ResolveContext): boolean;
  resolve(u: URL, ctx: ResolveContext): MediaCandidate[];          // Tier A/B, sync, network-free
  resolveNetwork?(u: URL, ctx: ResolveContext): Promise<MediaCandidate[]>; // Tier C, opt-in
}
```

- Per-platform modules (`twitterResolver`, `unsplashResolver`, `wallhavenResolver`)
  + a `genericCdnResolver` fallback (today's rules). `upgradeToOriginal()` becomes
  a dispatcher: first matching resolver wins.
- Resolvers return a **list** — images collapse to one; **video returns a ranked
  ladder** of mp4 variants + poster fallback (reason not to keep the single
  `{original,thumbnail}` shape for video).
- Thread the source `Element` (already held in `collectMedia()`) into
  `ResolveContext.el` for Tier-B (multi-photo dedup, wallhaven badge, X GIF poster).
- Opt-in "Resolve exact originals (makes network requests)" setting flips
  `allowNetwork=true`; run Tier-C in the background service worker (dodges page
  CSP/CORS), batched/throttled. Deep scan unchanged.

## Honest limits (must be in the spec)

1. X video without syndication/API is unresolvable network-free (blob/MSE). Best
   network-free fallback: poster, and GIF→`tweet_video/<ID>.mp4`. HLS-only/live
   need segment mux (ffmpeg.wasm) — out of scope.
2. X `orig` capped at 4096² — larger masters are gone.
3. Wallhaven ext can't come from a bare thumb URL; Tier-B works on normal browsing
   surfaces, else a Tier-C probe. Don't ship the blind-`.jpg` guess.
4. Unsplash+ premium originals are entitlement/signature-gated.
5. `format=`/`fm=` selects a transcode, not the master — prefer native format.

## Sources

Twitter image size suffixes (wiert.me 2025); gallery-dl #7695; X API media entity
(video_info variants); Unsplash API docs + download guideline; Wallhaven API v1;
Wallhaven Enhance userscript; Wallhaven-Downloader.
