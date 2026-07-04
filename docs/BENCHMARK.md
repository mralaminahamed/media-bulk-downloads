# Collection Benchmark

Functional benchmark of the media-collection engine against popular, high-traffic
websites. It measures what the extension's **actual** `collectMedia()` pipeline
(deep DOM extraction → native resolvers → URL de-proxy → CDN upgrade → dedup)
discovers on real pages.

## Method

- The real `src/extension/collect.ts` (with `extract.ts` / `imageUrl.ts` /
  `mediaType.ts` / `resolvers/*`) is bundled unchanged into an IIFE, injected into
  the page, and run once. No source is mocked or altered.
- **Read-only and network-free** — the collector only reads the DOM and rewrites
  URL strings. Nothing is fetched, clicked, or submitted. (Opt-in Phase-2 network
  resolution — Twitter video mp4, Wallhaven ext, Unsplash `/download` — is not
  exercised here; those items show as pending `resolveHint`s.)
- **Logged-out**, **first viewport only** — **Deep scan not run**. Counts are the
  baseline a normal scan sees; feeds yield far more after Deep scan.
- `upgraded` = items whose URL was rewritten to an original / paired with a
  gallery thumbnail (carry a `thumbnailSrc`). `hints` = items tagged for opt-in
  network resolution (Twitter videos, Wallhaven bare thumbs, Unsplash).
- Sample URLs are shown as `origin + path` (query stripped) for privacy.

Run dates: 2026-07-03 / 2026-07-04 / **2026-07-05** (§A fully re-run 2026-07-05).
Chrome (Manifest V3).

## A. Live-verified results

Each row was produced by injecting the real collector into the live page.

| Site               | Page                    | Total | Img | Vid    | Aud   | Upgraded | Dims | Hints | Notable CDNs                  |
|--------------------|-------------------------|-------|-----|--------|-------|----------|------|-------|-------------------------------|
| Wikipedia          | `/wiki/Cat`             | 126   | 107 | **11** | **8** | 92       | 54   | 0     | upload.wikimedia.org          |
| Unsplash           | `/s/photos/mountain`    | 71    | 71  | 0      | 0     | 42       | 50   | 20    | images./plus.unsplash.com     |
| Pexels             | `/search/mountain`      | 233   | 233 | 0      | 0     | **0**    | 209  | 0     | images.pexels.com *(gap)*     |
| YouTube            | home                    | 32    | 32  | 0      | 0     | 26       | 26   | 0     | i.ytimg.com, yt3.ggpht.com    |
| Allbirds (Shopify) | `/collections/mens`     | 77    | 77  | 0      | 0     | **73**   | 72   | 0     | www.allbirds.com/cdn/shop     |
| Reddit             | `old.reddit.com/r/pics` | 50    | 50  | 0      | 0     | 20       | 25   | 0     | i.redd.it, preview.redd.it    |
| Wallhaven          | `/latest`               | 67    | 67  | 0      | 0     | **64**   | 66   | 0     | th.wallhaven.cc               |
| X / Twitter        | `@NASA/media`           | 50    | 36  | **14** | 0     | 35       | 36   | 14    | pbs.twimg.com + video posters |
| X / Twitter        | `@NatGeo/media`         | 67    | 58  | **9**  | 0     | 57       | 58   | 9     | pbs.twimg.com + video posters |

Notes: **X `/media` grid** — each photo is a separate `<img>`, all upgraded to
`name=orig`; the grid is virtualized (~23–24 tiles mounted at capture time). Grid
videos (`ext_tw_video_thumb` / `amplify_video_thumb` posters over a `blob:`
source) are recognized and tagged for opt-in mp4 resolution — **@NASA 14** and
**@NatGeo 9** pending video hints (up from 2 / 3 in the prior run), helped by the
new page-URL `statusId` fallback. **Wikipedia `/wiki/Cat`** also surfaces **11
video + 8 audio** clips (pronunciation + animal-sound media on that article)
alongside its 107 images. Wallhaven upgrades depend on a DOM extension
badge/`<img>` (see §C-3).

### Collection vs upgrade per site (2026-07-05)

```mermaid
xychart-beta
    title "Total collected vs upgraded per site — first viewport, logged-out"
    x-axis ["Wikipedia", "Unsplash", "Pexels", "YouTube", "Allbirds", "Reddit", "Wallhaven", "X/NASA", "X/NatGeo"]
    y-axis "Items" 0 --> 240
    bar [126, 71, 233, 32, 77, 50, 67, 50, 67]
    line [92, 42, 0, 26, 73, 20, 64, 35, 57]
```

Bars = total items collected; the line = items upgraded to an original. Pexels has
no upgrade rule yet (line at 0); Allbirds, Wallhaven, and Wikipedia show the
strongest upgrade rates, while the two X rows now carry the video hints the
collector resolves on demand.

## B. What the engine got right (confirmed live)

- **Wikimedia path upgrade** — `/…/thumb/9/94/X.svg/40px-X.svg.png` → `/…/9/94/X.svg`
  (92/126).
- **Unsplash / Imgix query strip** — resize params (`w,h,fit,q,fm,auto,…`) removed
  to reach the native-format master.
- **YouTube** — `i.ytimg.com/vi/<id>/hq720.jpg` → `maxresdefault.jpg`; ggpht avatar
  `=s88-…` → `=s0`.
- **Shopify (modern)** — store-domain `/cdn/shop/…?width=N` drops the size query
  (Allbirds 0 → 73).
- **Gallery `<a href>`** — Reddit post links surfaced the direct `i.redd.it`
  original with the preview kept as the thumbnail.
- **Twitter** — multi-image tweets upgrade every grid photo to `name=orig` (no
  dupes); grid/detail video posters map to `statusId`-hinted pending videos
  (page-URL fallback when no `/status/` link is adjacent).
- **Signed-host posture** — `preview.redd.it` collected **byte-identical** (never
  query-stripped; stripping would 403).
- **Dedup & dims** — srcset/lazy duplicates collapse to one item on the upgraded
  URL; dimensions parsed from URL size tokens.
- **data: URIs** — inline SVG/icons collected as base64 with no network.

## C. Coverage matrix (CDN family → sites)

Beyond the live rows above, the engine's behavior on a site is determined by the
**CDN family** it serves from. This matrix maps 50+ popular sites/services to the
rule they exercise and how coverage was established: **[L]** live-tested here,
**[C]** covered by the same CDN rule verified on a live site, **[N]** needs opt-in
network (Phase 2), **[A]** auth/bot-gated (not automatable logged-out), **[G]** a
known gap.

| #  | Site / service                     | CDN family                    | Rule                     | Status  |
|----|------------------------------------|-------------------------------|--------------------------|---------|
| 1  | Wikipedia / Wikimedia Commons      | upload.wikimedia.org          | thumb→original           | **L**   |
| 2  | MediaWiki wikis (Fandom, wikiHow)  | *…/thumb/…px-…*               | thumb→original           | C       |
| 3  | Unsplash                           | images.unsplash.com (imgix)   | param strip              | **L**   |
| 4  | Unsplash+                          | plus.unsplash.com             | conservative strip       | C       |
| 5  | Any Imgix-backed site              | *.imgix.net                   | param strip              | C       |
| 6  | Pexels                             | images.pexels.com             | *(none)*                 | **L/G** |
| 7  | Pixabay                            | pixabay.com/cdn               | *(none)*                 | G       |
| 8  | YouTube (thumbnails)               | i.ytimg.com                   | →maxresdefault           | **L**   |
| 9  | YouTube (avatars/banners)          | yt3.ggpht.com                 | =s0                      | **L**   |
| 10 | Google Photos / Blogger / Sites    | lh3.googleusercontent.com     | =s0                      | C       |
| 11 | Google Play / Books art            | *.ggpht.com                   | =s0                      | C       |
| 12 | Shopify (classic)                  | cdn.shopify.com               | `_WxH` strip             | C       |
| 13 | Shopify (modern, own domain)       | */cdn/shop/                   | width/height strip       | **L**   |
| 14 | Allbirds / Gymshark / Kith …       | */cdn/shop/                   | width/height strip       | C       |
| 15 | Reddit (direct)                    | i.redd.it                     | gallery `<a>`            | **L**   |
| 16 | Reddit (preview, signed)           | preview.redd.it               | left intact              | **L**   |
| 17 | Old Reddit galleries               | i.redd.it                     | gallery `<a>`            | C       |
| 18 | Pinterest                          | i.pinimg.com                  | `/NNNx/`→`/originals/`   | C       |
| 19 | Amazon / marketplace               | m.media-amazon.com            | `._SX_` strip            | C       |
| 20 | Amazon (legacy)                    | ssl-images-amazon.com         | `._SX_` strip            | C       |
| 21 | Medium                             | miro.medium.com               | resize strip             | C       |
| 22 | WordPress.com / Jetpack            | i0-2.wp.com                   | resize + `-scaled`       | C       |
| 23 | Self-hosted WP (Photon)            | *.files.wordpress.com         | resize + `-scaled`       | C       |
| 24 | Cloudinary sites                   | res.cloudinary.com            | transform strip          | C       |
| 25 | Cloudinary fetch proxies           | res.cloudinary.com/…/fetch/   | de-proxy                 | C       |
| 26 | Next.js image sites (Vercel, many) | */_next/image?url=            | de-proxy                 | C       |
| 27 | wsrv / weserv proxies              | images.weserv.nl              | de-proxy                 | C       |
| 28 | Generic `?url=` image proxies      | any                           | de-proxy (media-checked) | C       |
| 29 | Wallhaven (grid, PNG badge)        | th.wallhaven.cc + span.png    | →full `.png`             | C       |
| 30 | Wallhaven (grid, jpg)              | th.wallhaven.cc               | →full `.jpg`             | C       |
| 31 | Wallhaven (`/w/<id>` page)         | `<img>` src                   | read full ext            | C       |
| 32 | Wallhaven (bare thumb)             | th.wallhaven.cc               | API/probe                | N       |
| 33 | X/Twitter (photos)                 | pbs.twimg.com/media           | `name=orig`              | **L**   |
| 34 | X/Twitter (multi-image)            | pbs.twimg.com/media           | each → orig              | **L**   |
| 35 | X/Twitter (avatars/banners)        | pbs.twimg.com/profile_*       | size strip               | C       |
| 36 | X/Twitter (GIF)                    | tweet_video_thumb             | → tweet_video mp4        | C       |
| 37 | X/Twitter (video)                  | ext_tw_video_thumb            | statusId → mp4           | **L/N** |
| 38 | Tumblr                             | *.media.tumblr.com            | *(none)*                 | G       |
| 39 | Flickr                             | live.staticflickr.com         | *(size suffix)*          | G       |
| 40 | DeviantArt                         | images-wixmp-…wixmp.com       | *(token)*                | G       |
| 41 | ArtStation                         | cdn*.artstation.com           | *(none)*                 | G       |
| 42 | 500px                              | drscdn.500px.org              | *(none)*                 | G       |
| 43 | Imgur                              | i.imgur.com                   | direct file              | C       |
| 44 | BBC News                           | ichef.bbci.co.uk              | *(size in path)*         | G       |
| 45 | The Verge / Vox                    | *.vox-cdn.com (imgix-like)    | *(none)*                 | G       |
| 46 | Substack                           | substackcdn.com               | *(cf-image)*             | G       |
| 47 | GitHub avatars/assets              | avatars.githubusercontent.com | =s / direct              | C       |
| 48 | Etsy                               | i.etsystatic.com              | *(size suffix)*          | G       |
| 49 | eBay                               | i.ebayimg.com                 | *(size suffix)*          | G       |
| 50 | Instagram                          | *.cdninstagram.com (signed)   | left intact              | A       |
| 51 | Facebook                           | *.fbcdn.net (signed)          | left intact              | A/L¹    |
| 52 | TikTok                             | *.tiktokcdn.com (signed)      | —                        | A       |
| 53 | Twitter timeline (home)            | pbs.twimg.com                 | as §A                    | A       |

¹ The signed-host **posture** (fbcdn/preview.redd.it left byte-identical) is
verified live on Reddit; the Instagram/FB pages themselves are login-gated.

## D. Gaps found

Resolved (this benchmark drove the fixes):
- ✅ **Shopify modern** `/cdn/shop/?width=` (Allbirds 0 → 73).
- ✅ **plus.unsplash.com** added to the Unsplash matcher.
- ✅ **Wallhaven** — DOM-badge/`<img>` resolver shipped (full-file ext, never a
  blind `.jpg`); bare thumbs are Phase-2 (API/probe).
- ✅ **Twitter video** — grid/detail videos recognized → statusId-hinted pending
  videos, now **shown** (poster + a per-item "Get video" action) and resolvable on
  demand regardless of the global setting; the statusId falls back to the page URL
  when no nearby `/status/` link exists (`@NASA` 14, `@NatGeo` 9 hints live). See
  [Resolve Originals](./guides/resolve-originals.md).

Open (candidates for new rules — all “collected but not upgraded”):
- **Pexels** `images.pexels.com?auto=compress&cs=…&w=…` — strip `w`/`h`/`auto`/`cs`
  to reach the original (0/233 upgraded live).
- **Flickr** `live.staticflickr.com/…_<size>.jpg` — map the size suffix (`_b`,`_c`,
  `_z`, `_o`) to the largest.
- **BBC / bbci** `ichef.bbci.co.uk/news/<width>/…` — swap the width segment.
- **Etsy / eBay / Tumblr / ArtStation / 500px / Vox / Substack** — each has a size
  token or transform param a dedicated rule could normalize.

## E. Caveats

- Numbers vary run-to-run (feeds, A/B layouts, virtualization, consent state).
  Treat them as representative, not exact.
- **[C]** rows are covered by the *same CDN rule* verified on a live site — high
  confidence but not independently run here.
- **[A]** rows are login/bot-gated; logged-out they return little. The extension
  still works there when the user is logged in.
- X virtualizes the media grid (~20–24 mounted at once) — **Deep scan** unions
  results across scroll for the full profile.
- This measures **discovery + URL upgrading**, not download success (network-free;
  a rewritten original isn't fetched to confirm 200). Phase-2 opt-in resolution
  (Twitter mp4, Wallhaven ext, Unsplash `/download`) runs only when enabled.

## F. Reproduce

Bundle the collector and inject it:

```bash
# entry.ts:  import { collectMedia } from '@/extension/collect';
#            (window as any).__bench = collectMedia();   # then tally by kind/upgraded/hints
# bundle:    esbuild entry.ts --bundle --format=iife --minify --alias:@=./src --outfile=bench.js
# inject bench.js into a live page (first viewport, logged-out), then read window.__bench.
# X /media virtualizes — wait for grid tiles to mount before injecting.
```

Pipeline under test: [Collection Pipeline](./guides/collection-pipeline.md) ·
native resolvers: [analysis](./native-resolvers-analysis.md).
