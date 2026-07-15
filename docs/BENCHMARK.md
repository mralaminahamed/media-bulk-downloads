# Collection Benchmark

Functional benchmark of the media-collection engine against popular, high-traffic
websites. It measures what the extension's **actual** `collectMedia()` pipeline
(deep DOM extraction → native resolvers → URL de-proxy → CDN upgrade → dedup)
discovers on real pages.

> For the plain-language summary of these results, see the
> [Feature one-pager](./marketing/one-pager.md).

## Method

- The real `apps/extension/src/extension/content/collect.ts` (with `extract.ts` / `imageUrl.ts` /
  `mediaType.ts` / `resolvers/*`) is bundled unchanged into an IIFE
  (`esbuild --bundle --format=iife --alias:@=./apps/extension/src`), injected into the page, and
  run once. No source is mocked or altered.
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

Run dates: 2026-07-03 / 2026-07-04 / **2026-07-05** / **2026-07-06** (§A re-run
2026-07-05 against the rule set as of that run — 32 CDN rules + 6 resolvers,
historical as of the 2026-07-05/06 run; Instagram resolver added 2026-07-06).
The resolver registry has since grown to 18 entries (17 dedicated + a generic
fallback — see [Collection Pipeline](./guides/collection-pipeline.md)); the
Threads, Bluesky, Arc XP and magnific resolvers were added since and are mapped in
§C rows 59–62, and the Mastodon and Booru resolvers were added 2026-07-11 (rows
65 and 67; Dailymotion, row 66, is an embed-hook + Phase-2 path like Vimeo, so it
is not a REGISTRY array entry). §G/§H below reflect the current Facebook/Instagram resolvers.
Chrome (Manifest V3).

## A. Live-verified results

Each row was produced by injecting the real collector into the live page
(logged-out, first viewport).

| Site                     | Page                    | Total | Img | Vid    | Aud   | Upgraded | Dims | Hints | Notable CDNs                     |
|--------------------------|-------------------------|-------|-----|--------|-------|----------|------|-------|----------------------------------|
| Wikipedia                | `/wiki/Cat`             | 126   | 107 | **11** | **8** | 92       | 54   | 0     | upload.wikimedia.org             |
| wikiHow (MediaWiki)      | `/Main-Page`            | 176   | 176 | 0      | 0     | **75**   | 125  | 0     | www.wikihow.com `/images/thumb/` |
| Unsplash                 | `/s/photos/mountain`    | 65    | 65  | 0      | 0     | 45       | 45   | 24    | images./plus.unsplash.com        |
| Pexels                   | `/search/mountain`      | 64    | 64  | 0      | 0     | **56**   | 49   | 0     | images.pexels.com                |
| Allbirds (Shopify)       | `/collections/mens`     | 75    | 75  | 0      | 0     | **71**   | 70   | 0     | allbirds.com `/cdn/shop`         |
| TechCrunch (self-host WP)| home                    | 42    | 42  | 0      | 0     | **32**   | 42   | 0     | techcrunch.com `/wp-content/`    |
| Wallhaven                | `/latest`               | 50    | 50  | 0      | 0     | **48**   | 49   | 0     | th.→w.wallhaven.cc               |
| Reddit                   | `/r/EarthPorn`          | 23    | 23  | 0      | 0     | 0        | 15   | 0     | preview.redd.it (signed, intact) |
| YouTube                  | home                    | 6     | 6   | 0      | 0     | 0        | 0    | 0     | (SPA — thumbs not yet mounted)   |

Notes: **wikiHow** and **TechCrunch** are new this cycle and confirm two
generalized rules firing live — self-hosted **MediaWiki** (`/images/thumb/…px-…`
→ original, 75 upgrades) and self-hosted **WordPress** (`/wp-content/uploads/`
resize + `-WxH` strip, 32 upgrades). **Pexels** now upgrades **56/64** (the
query-strip rule shipped after the earlier `0/233` capture). **Wallhaven** builds
`w.wallhaven.cc/full/…` from grid thumbs (48/50, ext read from the DOM badge).
**Reddit** (`/r/EarthPorn`, new layout) shows `preview.redd.it` collected
byte-identical — signed, correctly left intact (stripping would 403). **YouTube**
home rendered no thumbnails logged-out at capture time (run-to-run variance, §E);
the `→hqdefault` rule is verified in §C #8 / §A-2. Logged-out **X/Twitter** now
requires auth to view media grids and is covered as `[A]` in §C.

### Collection vs upgrade per site (2026-07-05)

```mermaid
xychart-beta
    title "Total collected vs upgraded per site — first viewport, logged-out"
    x-axis ["Wikipedia", "wikiHow", "Unsplash", "Pexels", "Allbirds", "TechCrunch", "Wallhaven", "Reddit", "YouTube"]
    y-axis "Items" 0 --> 180
    bar [126, 176, 65, 64, 75, 42, 50, 23, 6]
    line [92, 75, 45, 56, 71, 32, 48, 0, 0]
```

Bars = total items collected; the line = items upgraded to an original. The
strongest upgrade rates are Allbirds, TechCrunch, Wallhaven, Wikipedia and the two
generalized rules (wikiHow, Pexels); Reddit sits at 0 because its only CDN here is
the intentionally-untouched signed `preview.redd.it`.

## A-2. New-CDN rules — verified upgrades

The rules added this cycle whose sites were not live-injected above were each
confirmed by loading the thumbnail and the rewritten original (dimensions / bytes
via `curl` or in-browser `Image()`), 2026-07-05:

| Host                         | Thumbnail → Original                                   | Result             |
|------------------------------|--------------------------------------------------------|--------------------|
| target.scene7.com            | `?wid=1200` → `?wid=2000`                               | 64 KB → 182 KB     |
| cdn*.artstation.com          | `/smaller_square/` → `/large/`                          | 400² → 1192×936    |
| i5.walmartimages.com         | drop `?odnWidth/odnHeight`                              | 4.4 KB → 214 KB    |
| c1.neweggimages.com          | `…compressall300` → `…compressall1280`                 | 80 KB → 1.15 MB    |
| www.ikea.com/images          | `?f=xxs` → `?imwidth=2000`                              | 17.6 KB → 101.7 KB |
| static01.nyt.com             | `-articleLarge` → `-superJumbo` (+drop quality)        | 57.6 KB → 1.09 MB  |
| cdn.dribbble.com             | drop `?resize=WxH`                                      | 145 KB → 4.21 MB   |
| *.alicdn.com / aliexpress    | strip `.jpg_640x640.jpg_.webp` transform suffix        | 48.6 KB → 73.4 KB  |
| i.imgur.com                  | 8-char thumb `…b.jpg` → 7-char `….jpg`                 | 6.7 KB → 154 KB    |
| images-wixmp-*.wixmp.com     | signed-token cap → `/v1/fill/w,h,q_100/`               | 9 KB → 624 KB      |
| cdn.stocksnap.io             | `/img-thumbs/280h/` → `/img-thumbs/960w/`              | 420×280 → 960×640  |
| photos.zillowstatic.com      | `-p_e` → `-uncropped_scaled_within_1536_1152`          | 596×446 → 1536×853 |
| ichef.bbci.co.uk             | `/news/640/` → `/news/2048/` (`1920` 404s on `/news/`) | HTTP 404 → 200     |

## B. What the engine got right (confirmed live)

- **Wikimedia / MediaWiki path upgrade** — `/…/thumb/9/94/X.svg/40px-X.svg.png` →
  `/…/9/94/X.svg`, host-agnostically (Wikipedia 92/126; **wikiHow 75/176**).
- **Self-hosted WordPress** — `techcrunch.com/wp-content/uploads/…?w=` → bare
  original (**32/42**), previously uncovered (`wp-photon` only matched `wp.com`).
- **Unsplash / Imgix query strip** — resize params (`w,h,fit,q,fm,auto,…`) removed
  to reach the native-format master.
- **Pexels** — `images.pexels.com?…w=&h=&auto=` → bare original path (**56/64**).
- **YouTube** — small thumbs (`default`/`mqdefault`/`0`–`3`) → `hqdefault`, the
  largest always-present variant (maxres/sd 404 for many videos, and collection is
  network-free so they can't be probed); ggpht avatar `=s88-…` → `=s0`.
- **Shopify (modern)** — store-domain `/cdn/shop/…?width=N` drops the size query
  (Allbirds 71/75).
- **Wallhaven** — grid thumbs → `w.wallhaven.cc/full/<ab>/wallhaven-<id>.<ext>`,
  the file extension read from the DOM badge/`<img>` (never a blind `.jpg`);
  **48/50**.
- **Signed-host posture** — `preview.redd.it` collected **byte-identical** (never
  query-stripped; stripping would 403). Same for Guardian `i.guim.co.uk`, 500px.
- **Dedup & dims** — srcset/lazy duplicates collapse to one item on the upgraded
  URL; dimensions parsed from URL size tokens.
- **data: URIs** — inline SVG/icons collected as base64 with no network.

## C. Coverage matrix (CDN family → sites)

Beyond the live rows above, the engine's behavior on a site is determined by the
**CDN family** it serves from. This matrix maps 67 popular sites/services to the
rule they exercise and how coverage was established: **[L]** live-injected in this
run, **[C]** covered by the same CDN rule verified on a live site (or built and
verified against a real sampled URL — HTTP/`Image()` — pulled from that site),
**[N]** needs opt-in network (Phase 2), **[A]** auth/bot-gated (not automatable
logged-out), **[G]** a known gap.

| #  | Site / service                     | CDN family                    | Rule                                                                                       | Status  |
|----|------------------------------------|-------------------------------|--------------------------------------------------------------------------------------------|---------|
| 1  | Wikipedia / Wikimedia Commons      | upload.wikimedia.org          | thumb→original                                                                             | **L**   |
| 2  | MediaWiki wikis (wikiHow, Fandom)  | *…/thumb/…px-…* (any host)    | `/thumb/…/<N>px-<name>`→original (host-agnostic)                                           | **L**   |
| 3  | Unsplash                           | images.unsplash.com (imgix)   | param strip                                                                                | **L**   |
| 4  | Unsplash+                          | plus.unsplash.com             | conservative strip                                                                         | **L**   |
| 5  | Any Imgix-backed site              | *.imgix.net                   | param strip                                                                                | C       |
| 6  | Pexels                             | images.pexels.com             | strips the resize query string                                                             | **L**   |
| 7  | Pixabay                            | cdn.pixabay.com               | `_<size>` → `_1280` (capped — largest hotlinkable; true original is login-gated)           | C       |
| 8  | YouTube (thumbnails)               | i.ytimg.com                   | small thumbs → `hqdefault` (always-present max; maxres/sd 404 for many videos)             | C       |
| 9  | YouTube (avatars/banners)          | yt3.ggpht.com                 | =s0                                                                                        | C       |
| 10 | Google Photos / Blogger / Sites    | lh3.googleusercontent.com     | =s0                                                                                        | C       |
| 11 | Google Play / Books art            | *.ggpht.com                   | =s0                                                                                        | C       |
| 12 | Shopify (classic)                  | cdn.shopify.com               | `_WxH` strip                                                                               | **L**   |
| 13 | Shopify (modern, own domain)       | */cdn/shop/                   | width/height strip                                                                         | **L**   |
| 14 | Amazon / marketplace / IMDb        | m.media-amazon.com            | `._SX_` strip                                                                              | C       |
| 15 | Amazon (legacy)                    | ssl-images-amazon.com         | `._SX_` strip                                                                              | C       |
| 16 | Reddit (direct / gallery)          | i.redd.it                     | gallery `<a href>` → direct original                                                       | C       |
| 17 | Reddit (preview, signed)           | preview.redd.it               | left intact                                                                                | **L**   |
| 18 | Pinterest                          | i.pinimg.com                  | `/NNNx/`→`/originals/`                                                                     | C       |
| 19 | Medium                             | miro.medium.com               | resize strip                                                                               | C       |
| 20 | WordPress.com / Jetpack (Photon)   | i0-2.wp.com / files.wp.com    | resize + `-scaled`                                                                         | C       |
| 21 | Self-hosted WordPress (any host)   | */wp-content/uploads/         | drop resize query + strip `-WxH`/`-scaled` → original                                      | **L**   |
| 22 | Cloudinary sites                   | res.cloudinary.com            | transform strip                                                                            | C       |
| 23 | Cloudinary fetch / Substack        | res.cloudinary.com/…/fetch/   | de-proxy                                                                                   | C       |
| 24 | Next.js image sites (Vercel, many) | */_next/image?url=            | de-proxy (absolute **and** same-origin relative)                                          | C       |
| 25 | wsrv / weserv proxies              | images.weserv.nl              | de-proxy                                                                                   | C       |
| 26 | Generic `?url=` image proxies      | any                           | de-proxy (media-checked)                                                                   | C       |
| 27 | Wallhaven (grid + `/w/` page)      | th.wallhaven.cc → w.wallhaven | id from path/`data-wallpaper-id`/`a.preview`; `span.png`/`span.gif` badge → full file, unbadged = jpg; no ext → `/orig` jpg + Phase-2; `.wall-res` true dims; thumb `/small`→`/lg` | **L/N** |
| 28 | X/Twitter (photos, multi-image)    | pbs.twimg.com/media           | each → `name=orig`                                                                         | C/A     |
| 29 | X/Twitter (avatars/banners)        | pbs.twimg.com/profile_*       | size strip                                                                                 | C       |
| 30 | X/Twitter (GIF / video)            | tweet_video / ext_tw_video    | → mp4 / statusId-hinted                                                                    | C/N     |
| 31 | Flickr                             | *.staticflickr.com            | small size code → `_b` (1024, capped); larger left alone                                   | C       |
| 32 | Behance                            | mir-s3-cdn-cf.behance.net     | `/project_modules/<size>/`→`/source/`; prefers a `source`/`fs` srcset URL                  | C       |
| 33 | ArtStation                         | cdn*.artstation.com           | size bucket (`smaller_square`,`medium`,…) → `/large/`                                       | C       |
| 34 | DeviantArt                         | images-wixmp-…wixmp.com       | decode signed-token cap → `/v1/fill/w,h,q_100/` within cap (fail-safe: unchanged)          | C       |
| 35 | imgur                              | i.imgur.com                   | 8-char thumb suffix (`s,b,t,m,l,h,r,g`) → original (7-char id gated)                       | C       |
| 36 | Dribbble                           | cdn.dribbble.com              | drop `?resize=` query → original                                                          | C       |
| 37 | Tumblr                             | *.media.tumblr.com            | *(no rule — size folders not swappable; every other `/sWxH/` 404s, served size is max)*    | G¹      |
| 38 | BBC News                           | ichef.bbci.co.uk              | width segment (`/news/<N>/`, `/ace/standard/<N>/`) → `2048` (1920 404s on `/news/`)        | C       |
| 39 | NYT                                | static01.nyt.com              | editorial crop (`articleLarge`,`mediumThreeByTwo…`) → `-superJumbo`, drop quality query    | C       |
| 40 | The Verge (WP uploads)             | platform.theverge.com         | resize query strip                                                                        | C       |
| 41 | Etsy                               | i.etsystatic.com              | `il_WxH` → `il_fullxfull`                                                                  | C       |
| 42 | eBay                               | i.ebayimg.com                 | `s-l<NNN>` → `s-l1600`                                                                     | C       |
| 43 | AliExpress                         | *.alicdn.com / aliexpress-media | strip transform suffix after real ext (`.jpg_640x640.jpg_.webp` → `.jpg`)                 | C       |
| 44 | Adobe Scene7 (Target, REI, …)      | *.scene7.com                  | set `wid=2000`, drop `hei/qlt/fmt`                                                         | C       |
| 45 | Walmart                            | i5.walmartimages.com          | drop `?odnHeight/odnWidth/odnBg` query → full source                                        | C       |
| 46 | Newegg                             | c1.neweggimages.com           | `…compressall<N>` → `…compressall1280` (max)                                               | C       |
| 47 | IKEA                               | www.ikea.com/images           | drop query, set `?imwidth=2000` (beats the `f=` ladder)                                    | C       |
| 48 | StockSnap                          | cdn.stocksnap.io              | `/img-thumbs/<token>/` → `/img-thumbs/960w/` (max whitelist size)                          | C       |
| 49 | Zillow                             | photos.zillowstatic.com       | trailing `-<token>.<ext>` → `-uncropped_scaled_within_1536_1152.webp`                      | C       |
| 50 | GitHub avatars/assets              | avatars.githubusercontent.com | *(none — `=s0` covers googleusercontent/ggpht only; GitHub served as-is)*                   | C       |
| 51 | Guardian                           | i.guim.co.uk (signed)         | *(none — HMAC `s=` token; any width change → 401)*                                          | G       |
| 52 | 500px                              | drscdn.500px.org (signed)     | *(none — signed URLs)*                                                                      | G       |
| 53 | Giphy / Tenor                      | media*.giphy.com / tenor.com  | grid serves the `giphy.gif`/`tenor.gif` original, but **embeds elsewhere use downsized variants** (`200w`, `giphy-downsized`, fixed-width) → upgraded to the original: Giphy `{variant}`→`giphy.gif`, Tenor 5-char code→`AAAAC` (shipped 2026-07-15) | C       |
| 54 | Instagram                          | *.cdninstagram.com (signed)   | **resolver** — reads the post's media graph from page JSON + sniffed GraphQL; every carousel slide + real mp4 (signed URLs read, never rewritten) | **L**³  |
| 55 | Facebook                           | *.fbcdn.net / *.cdninstagram.com (signed) | **resolver** — passive MAIN-world sniffer reads `text/html`-NDJSON GraphQL + page hydration; full-res photos + reel mp4s, 77–90% accuracy (§G) | **L**   |
| 56 | TikTok                             | *.tiktokcdn.com (signed)      | —                                                                                          | A       |
| 57 | Temu                               | img.kwcdn.com                 | drop the Qiniu `imageView2/…` transform query → stored original (sample-based)             | C²      |
| 58 | LinkedIn                           | media.licdn.com (signed)      | *(none — `dms/image/v2` renditions carry an HMAC `t=` token bound to the size; any rewrite 401s)* | G       |
| 59 | Threads (profile grid + posts)     | *.cdninstagram.com / *.fbcdn.net on threads.com | **resolver** — a mounted post ships the full original directly in the `<img srcset>` (up to ~2610w); returns the widest candidate (generic dedup would keep the thumbnail). Gated to threads.com/net | **L**⁴  |
| 60 | Bluesky                            | cdn.bsky.app                  | **resolver** — `feed_thumbnail`→`feed_fullsize` / `avatar_thumbnail`→`avatar` (network-free); `feed_video_blob` → pending video (HLS master on video.bsky.app); true original via `com.atproto.sync.getBlob` (Phase 2) | C/N⁴   |
| 61 | Arc XP / Fusion (Reuters, many pubs)| */resizer/v2/…?auth= (host-agnostic) | **resolver** — reuse the page-issued `auth` (bound to the source, not a width); collapse the srcset widths to the single widest; never strip the token (would 403) | C⁴      |
| 62 | Magnific                           | img.magnific.com              | **resolver** — collapse the signed srcset widths to the widest; each token is width-bound so it is never stripped (stripping downgrades to the 626px default) | C⁴      |
| 63 | Vimeo                              | player.vimeo.com config → *.vimeocdn.com | **resolver** (Phase 2) — read the public player config; highest progressive mp4 as a direct download, else the HLS master to capture | N       |
| 64 | YouTube (video links / embeds)     | youtube.com, youtu.be, /embed, /shorts → i.ytimg.com | **resolver** — video id from any watch/embed/short URL → `hqdefault` poster (thumbnails only; ciphered streams deliberately untouched per ToS/policy) | C       |
| 65 | Mastodon (fediverse, host-agnostic) | */media_attachments/files/* (any instance host) | **resolver** — `/small/`→`/original/` size-folder swap; the `<hash>.<ext>` basename is identical across sizes so the upgrade is 404-safe (no ext guessing); gated to the media_attachments path shape, network-free | C⁵ |
| 66 | Dailymotion | dailymotion.com / geo.dailymotion.com / dai.ly → dmcdn.net | **resolver** (Phase 2) — read the public player metadata (`player/metadata/video/<id>`); modern delivery is HLS-only, so return the `qualities.auto` `x-mpegURL` master to capture; DRM (`protected_delivery`) left unresolved | N⁵ |
| 67 | Booru (Danbooru/Gelbooru/Safebooru/yande.re/Konachan) | booru image hosts (donmai.us, yande.re, konachan, gelbooru, safebooru) | **resolver** — reads the DOM's true original (`data-file-url` on Danbooru grid+post; the original-image link on Gelbooru/Moebooru post pages), element-scoped + host-pinned to the booru's own image host; grid coverage full on Danbooru, post-page on the others; network-free | C⁵ |
| 68 | Pixiv | i.pximg.net | **resolver** — on an artwork page reads the embedded `#meta-preload-data` JSON for the exact `urls.original` (correct extension — the displayed `img-master` master is always `.jpg` even for `.png`/`.gif` uploads, so a blind rewrite would 404); multi-page derived by `_p0`→`_p<n>`; a `/c/<crop>/` feed crop of a `_master1200` master upgrades to the un-cropped master; host-pinned, network-free (pximg is `Referer`-gated — download uses the #197 referer opt-in) | C⁶ |
| 69 | Newgrounds | art.ngfiles.com | **CDN rule** — the art view page already serves the true original under `/images/…<hash>.<ext>` (collected directly; thumb→full is not derivable — the full filename carries a content hash + slug absent from the `/thumbnails/` URL), so the rule only drops the `?f<ts>` cache-buster to canonicalise for de-dupe | C⁶ |

¹ Tumblr previously had a `/sWxH/` → `/s1280x1920/` rule; it was **removed** — modern
`64.media.tumblr.com` pre-renders one size folder per image and every other size 404s,
so the rewrite replaced a working image with a dead link (see §D).

² Temu is built from a **documented** real `img.kwcdn.com` sample (temu.com is
captcha-gated, so it was not live-injected). The rule fires only when the query
carries the `imageView2` transform, so a signed/plain kwcdn URL is left untouched
(worst case: a no-op, never a broken link).

³ Instagram is **signed** (stripping the `stp` size token → 403, verified live),
so no URL-rewrite rule is possible. Instead a dedicated resolver reads the
largest URL Instagram itself signed and shipped: `image_versions2.candidates[0]`
and the real progressive-mp4 `video_versions` live in the page's own
`<script type="application/json">` hydration and the GraphQL/`api/v1` responses
it fetches on scroll (captured by a passive MAIN-world sniffer — read-only, no
forged requests). Verified live 2026-07-06 against a public profile: single
image, reel (9 MB mp4, HTTP 200), and 9- and 10-slide carousels (every child
1440 px, HTTP 200). Facebook (row 55) now has its own dedicated resolver + a
passive MAIN-world sniffer (`fb-media-sniffer`), covering photos and reels at
77–90% original-image accuracy — see §G below for the full measurement.
Instagram media served from `fbcdn.net` is covered by the Instagram resolver.
Reels-tab / grid **clips ship only a cover** (`media_type` 2 with no
`video_versions`, confirmed live) — no bulk mp4 exists without forging the
private per-reel GraphQL, which this extension does not do. They surface as
**pending videos** (poster = cover) that upgrade to the real mp4 when the reel's
own response is sniffed (on play/open).

⁴ Rows 59–62 are newer dedicated resolvers, each with unit tests and an e2e page
fixture driving the real bubble (PRs #266–#268); their URL shapes come from real
samples. **Threads** image extraction was live-verified 2026-07-10 (grid originals
1119–3277 px across three public profiles; see §I for Threads video) — hence **L**.
**Bluesky / Arc XP / magnific** are verified against those real-sampled URL shapes
via the fixtures, not yet live-injected in a benchmark run — hence **C** (Bluesky's
getBlob original and Vimeo are opt-in network, **N**). The HLS-master fallback of
the Vimeo/Twitter/Pinterest network resolvers gained real-shaped `resolveOriginal`
fixtures in the same cycle.

⁵ Rows 65–67 added 2026-07-11. **Mastodon** and **Booru** are network-free
(DOM/URL) resolvers verified against real sampled URL shapes; **Dailymotion** is
opt-in Phase-2 (**N**) reading the public player metadata (HLS-only; no
progressive MP4). Booru grid coverage is full on Danbooru (`data-file-url` in the
grid DOM) and post-page-only on Gelbooru/Moebooru (their grids expose no
original).

⁶ Rows 68–69 added 2026-07-13 (#286, gallery-dl parity). Real samples verified
live 2026-07-13. **Pixiv** — artwork is login-gated; when logged in the page
embeds `#meta-preload-data` naming the exact original, which the resolver reads
network-free (pximg is `Referer`-gated, so the fetch path can't reach it; the
original still downloads via the #197 referer opt-in). **DeviantArt** (row: wixmp
`/v1/fill/` token-cap upgrade, #101) and **Tumblr** (deliberately un-rewritten,
¹/§D) were already covered, so #286 added no rule for them. **Sankaku** was
deferred (see §D): its originals are signed-token/login-gated, so a passive
rewrite would 404 — against the network-free-by-default, no-auth model.

## D. Gaps found

Resolved (this benchmark drove the fixes):
- ✅ **Shopify modern**, **plus.unsplash.com**, **Twitter video**,
  **Pexels**, **Pixabay**, **Flickr**, **Etsy**, **eBay**, **The Verge**, **Substack**,
  **Behance** — as in prior runs.
- ✅ **Wallhaven** — re-verified against the live grid (2026-07-05): id also reads
  `a.preview` `/w/<id>`; the `span.png`/`span.gif` badge is real (~34% of a SFW page
  are png) so an unbadged figure is genuinely jpg; `.wall-res` gives true dims; the
  no-ext bare-thumb case now upgrades to the `/orig/` jpg (guaranteed to exist) + a
  Phase-2 hint rather than a blind full-file URL, and the grid `thumbnailSrc` bumps
  `/small`→`/lg`. Note: the `/api/v1/w/<id>` endpoint returns **401 for NSFW/sketchy
  wallpapers without an apikey**, so Phase-2 can only resolve those with a key
  (the network resolver already fails safe to the thumb). Purity/category codes:
  `purity` `100`=SFW / `010`=sketchy / `001`=NSFW; `categories` `100`=General /
  `010`=Anime / `001`=People.
- ✅ **Self-hosted WordPress** `*/wp-content/uploads/` — drop resize query + strip
  `-WxH`/`-scaled` (the `wp-photon` rule only covered `wp.com`/`files.wordpress.com`).
  Live: TechCrunch 32/42.
- ✅ **Self-hosted MediaWiki** — the wikimedia thumb rule generalized host-agnostically
  to any `/thumb/…/<N>px-<name>`. Live: wikiHow 75/176.
- ✅ **Adobe Scene7** `*.scene7.com` — set `wid=2000`, drop `hei/qlt/fmt` (Target, REI).
- ✅ **ArtStation** `cdn*.artstation.com` — size bucket → `/large/` (`/original/` is 403,
  `/4k/` not always present).
- ✅ **imgur** `i.imgur.com` — 8-char thumb suffix → 7-char original (strict length gate:
  a 7-char id blindly stripped resolves to a *different* image, not a 404).
- ✅ **DeviantArt** `wixmp.com` — decode the signed `?token` JWT cap and request
  `/v1/fill/` at that cap (over-request 403s, dropping the token 401s; fail-safe leaves
  the URL unchanged when the cap can't be read).
- ✅ **Walmart / Newegg / IKEA / StockSnap / Zillow** — retail/stock CDN size tokens
  normalized to each host's largest valid preset (all verified via live browser load).
- ✅ **NYT** `static01.nyt.com` — editorial crop → `-superJumbo` + drop quality query.
- ✅ **Dribbble** `cdn.dribbble.com`, **AliExpress** `alicdn`/`aliexpress-media` — drop
  resize query / strip transform suffix.
- ✅ **Relative Next.js `_next/image`** — `deproxy()` now resolves a same-origin relative
  `?url=/path` against the page origin (previously only absolute inner URLs unwrapped).
- ✅ **Booru family expansion (2026-07-15)** — the `booru` resolver's host allow-list gained
  **e621.net / e926.net / e6ai.net** (e621ng = Danbooru fork; `#image-container[data-file-url]`,
  verified live on e926.net) and the Gelbooru-0.2 self-hosts **rule34.xxx / tbib.org /
  hypnohub.net / xbooru.com / realbooru.com** (same `#image` + "Original image" `/images/`
  anchor as gelbooru.com, pinned to each site's own domain). No new engine — reuses the
  existing Danbooru/Gelbooru branches; `pinnedDomUrl` fails safe on any off-domain original.
  Deferred: **sakugabooru** (Moebooru but video-first — the `id="image"` gate + video path
  need a tweak, tracked in #350).
- ✅ **Tier-1 GIF/video + free-stock CdnRules (2026-07-15)** — five passive rules, each
  live-probed for real thumbnail→original byte deltas before shipping:
  - **Giphy** `media*.giphy.com` — `.gif` rendition filename → `giphy.gif` (scoped to `.gif`
    so an `.mp4`/`.webp` keeps its format; the `/v1.<cid>/` tracking segment is optional).
  - **Tenor** `media*.tenor.com` — trailing 5-char rendition code → `AAAAC` (largest GIF),
    keeping the 11-char base id + host + optional `/m/` (scoped to `.gif`; `.mp4` uses a
    different code and is left alone).
  - **imgur** `i.imgur.com` — `.gifv` HTML wrapper → same-id `.mp4` video original (closes
    the video gap next to the existing image thumb-strip rule).
  - **Burst by Shopify** `burst.shopifycdn.com/photos/` — strip the `?width=&format=&exif=`
    query → full-res CC0 original (3.9 MB vs 66 KB, verified).
  - **WallpaperCave** `wallpapercave.com` — editor `/w<N>/<code>` thumb folder → `/wp/<code>`
    full image (the digit gate skips the `/w/<code>` detail page; the inconsistent
    user-uploaded `/fuwp/uwp<id>` family is deferred).
  - Deferred: **We Heart It** — `data.whicdn.com` is **DNS-dead** (Route53 delegation
    REFUSED as of 2026-07-15); no rule shipped until the current CDN host is confirmed.
- ✅ **Tier-2 DOM-read image-board resolvers (2026-07-15)** — two sync, network-free,
  SFW-capable resolvers reading the full-original straight from page markup (no API):
  - **Philomena / booru-on-rails** — a new `booru` branch reads the `full` key of the
    entity-encoded JSON `data-uris` on the media container, host-pinned per site:
    **derpibooru.org** → `derpicdn.net`, **furbooru.org** → `furrycdn.org` (not
    furbooru.org), **ponybooru.org** → `cdn.ponybooru.org`, **twibooru.org** →
    `cdn.twibooru.org`. Element-scoped via `closest('[data-uris]')` so a grid thumb
    resolves its own container; `pinnedDomUrl` fails safe on any off-domain `full`.
    (twibooru's `full` is a re-encoded full-res representation, not the byte-original —
    acceptable and far more robust than a title-based View-anchor selector.)
  - **zerochan.net** — a dedicated resolver reads the JSON-LD `ImageObject.contentUrl`
    (fallback: the `#large a.preview` href), scoped to the main `#large` image so a
    related/grid thumb never inherits the post's full URL. Host-pinned to `zerochan.net`
    (`static.zerochan.net`). The CDN is hotlink-protected (needs `Referer`) — the
    existing hotlink-403 Referer retry covers it.
  - Deferred to a network-API follow-up (not the network-free model): Streamable,
    RedGifs, Twitch clips, 9GAG, wallpaperscraft.
- ✅ **Tier-2 network-API resolvers (2026-07-15)** — three site-support adds, each
  verified against the forbidden-header (`Referer`/`User-Agent` are dropped by a
  background `fetch`) / no-redirect (`redirect: 'error'`) / host-pinned model:
  - **Streamable** — a `streamable.com` watch/embed link or player `<iframe>` surfaces a
    pending video (`resolveHint 'streamable'`); the opt-in resolve pass reads the public
    `GET api.streamable.com/videos/<shortcode>` JSON and returns the progressive
    `files.mp4.url` (fallback `mp4-mobile`), pinned to `.streamable.com`. The
    CloudFront-signed URL expires, so it is resolved on demand. Reserved first-segment
    pages (`/login` …) and multi-segment paths are refused so only real shortcodes match.
  - **RedGifs** (NSFW) — a `redgifs.com` watch/`ifr` link or `<iframe>` surfaces a pending
    video (`resolveHint 'redgifs'`); the resolve pass does two allowed-header hops
    (`GET /v2/auth/temporary` → bearer → `GET /v2/gifs/<id>` `Authorization: Bearer`) and
    returns `gif.urls.hd` (fallback `sd`), pinned to `.redgifs.com`. The bearer token is
    used only for that request and never logged/persisted. The media lives on the
    hotlink-protected `media.redgifs.com`: a background fetch of it would 403 on the
    missing `Referer`/`User-Agent`, so the resolver only produces the URL — the **download**
    clears the 403 via the #197 Referer rewrite (the item's `redgifs.com` source page
    becomes the injected `Referer`) plus `chrome.downloads`' real browser User-Agent.
    Works cleanest when collected on `redgifs.com`; a RedGifs embed on a third-party page
    injects that page's Referer instead and may still 403 (documented limitation).
  - **wallpaperscraft** (network-free DOM) — an `images.wallpaperscraft.com` preview image
    is upgraded to the largest resolution the page lists in its `/download/<slug>/<res>`
    links, rebuilt on the deterministic `/image/single/<slug>_<W>x<H>.<ext>` path. Returns
    `[]` (→ generic identity) when the DOM lists nothing larger, so a preview is never
    replaced by a guessed URL that could 404 (a blind resolution bump does — not every
    wallpaper has 4K).
  - Deferred to a further follow-up: **Twitch clips** (feasible via a Client-ID GraphQL
    POST → tokened `.twitchcdn.net` mp4, but brittle — the persisted-query hash rotates and
    the tokens expire fast) and **9GAG** (id-derived `img-9gag-fun.9cache.com/photo/<id>_460sv.mp4`,
    but the image-vs-video DOM disambiguation needs live verification). **RedGifs media**
    was the only member of this batch that was previously called infeasible — the #197
    hotlink path is what makes it shippable.

Corrected:
- 🔧 **YouTube** — `→maxresdefault` replaced a working `hqdefault` with a dead link when
  maxres was absent (404, common). Now upgrades only small thumbs → `hqdefault`, the
  always-present max; existing hq/sd/maxres are left as the page served them.
- 🔧 **BBC** — the width rewrite targeted `1920`, which **404s on the `/news/` path**;
  now targets `2048` (served on both `/news/` and `/ace/standard/`).

Reverted:
- ↩︎ **Tumblr** `*.media.tumblr.com` — the `/sWxH/` → `/s1280x1920/` rule was **removed**:
  modern `64.media.tumblr.com` serves exactly one pre-rendered size per image, so any
  other size folder 404s (see §C #37).

Open (not upgradeable — signed / already-original):
- **Guardian** `i.guim.co.uk` — HMAC `s=<hex>` per width; any change → 401.
- **500px** `drscdn.500px.org` — signed URLs.
- **Sankaku** (#286, deferred) — originals are signed-token + login-gated; a passive
  preview→original rewrite would 404. Out of the no-auth, network-free-by-default model.
- **preview.redd.it** — signed (left byte-identical by design, verified live).
- **Guardian** stays open (above); Giphy / Tenor **moved to Resolved** (2026-07-15) — the
  downsized-variant upgrade is now a shipped Tier-1 CdnRule (see the Resolved list above).

## E. Caveats

- Numbers vary run-to-run (feeds, A/B layouts, virtualization, consent state,
  SPA hydration timing). Treat them as representative, not exact — e.g. YouTube's
  home rendered 0 thumbnails logged-out in this capture.
- **[C]** rows are covered by the *same CDN rule* verified on a live site, or
  verified against a real sampled URL by HTTP/`Image()` load (thumbnail vs
  rewritten original) — not necessarily live-injected in this run (§A-2).
- **[A]** rows are login/bot-gated; logged-out they return little. The extension
  still works there when the user is logged in.
- This measures **discovery + URL upgrading**. §A is network-free (a rewritten
  original isn't fetched during collection); §A-2 additionally loaded each
  rewritten URL to confirm it resolves and is larger. Phase-2 opt-in resolution
  (Twitter mp4, Wallhaven ext, Unsplash `/download`) runs only when enabled.

## F. Reproduce

Bundle the real collector and inject it:

```bash
# bench-entry.ts:  import { collectMedia } from '@/extension/content/collect';
#                  (window as any).__bench = () => tally(collectMedia());  // by kind/upgraded/hints
# Run from the repo root so the `@mbd/*` workspace packages resolve via node_modules.
esbuild bench-entry.ts --bundle --format=iife --alias:@=./apps/extension/src --outfile=bench.js
# Inject bench.js into a live page (first viewport, logged-out), scroll to trigger
# lazy-load, then read JSON.stringify(window.__bench()).
# Virtualized grids (X /media) mount ~20–24 tiles at once — wait before injecting.
```

Pipeline under test: [Collection Pipeline](./guides/collection-pipeline.md).

## G. Facebook original-image accuracy (passive sniff) — 2026-07-10

Facebook serves `/api/graphql` over **XHR** as **`content-type: text/html`**
multi-chunk **NDJSON**. The shared response-sniffer previously dropped 100% of
it at two gates (json-only content-type + single `JSON.parse`), so the FB
resolver upgraded only the ~dozen photos in on-page hydration — original-image
accuracy ~5%. This branch makes the content-type predicate + NDJSON parsing
configurable (FB opts in; Instagram/X unchanged), adds the reel `progressive_url`
key + `/photo(s)/<id>` fbid path + `/photos/` anchor selector, and de-duplicates
async upgrades via a `mediaKey` identity. Photo media lives under `viewer_image`;
reel/video under `progressive_url` (NOT `playable_url` — measured live).

**Metric:** of the photo items surfaced after a bounded passive scroll, the
fraction whose captured original has `min(w,h) >= 1024` (`ORIGINAL_MIN_PX`), the
same way Instagram's ~80% is measured. FB's photo grid is heavily virtualized
(~10–18 tiles mounted at once of 217), so a live snapshot samples few tiles.

Measured live 2026-07-10 across a local link list (7 real photo pages, 3 reel
permalinks, 1 reel-tab; replica†). "surfaced" = grid tiles the extension
collects at scan time; "≥1024" counts a tile whose captured original clears
`ORIGINAL_MIN_PX` (reels: whose downloadable `progressive_url` mp4 was captured).
`pctAll` counts all surfaced tiles; `pctCaptured` counts only the subset the
sniffer streamed anything for (the gap is post-load-injection lag that the real
`document_start` sniffer closes). Per-page raw figures are kept in a gitignored
`test-samples/` file — no account identifiers are recorded in this public doc.

**Photos** — 6 real grids (a further page never loaded a grid under automation
and is excluded as an outlier):

| Grid | pctAll (≥1024) | pctCaptured |
|---|---|---|
| large grid (137 tiles) | **77%** | 94% |
| five small grids (9–10 tiles) | **80 / 89 / 89 / 90 / 90 %** | 89–100% |

**Reels** — all 3 reel permalinks plus a reel-tab (80 tiles): every reel was
captured as a downloadable mp4 under **`progressive_url`**, the **only** video
key seen (`playable_url` absent everywhere). Reel-tab: 70/80 (**88%**) captured,
100% of the captured subset.

**Verdict:** across the 6 real photo grids the passive fix surfaces a ≥1024
original for **77–90%** of collected photos (**89–100%** of tiles it actually
captured), and every reel resolves to a downloadable `progressive_url` mp4 —
clearing the ≥80% target. Sub-80% is the post-load-injection lower bound
(77% → 94% of captured). Pre-fix this same path captured **0**.

†**replica** = the shipped sniffer's logic (on-page hydration parse + XHR NDJSON
sniff of `viewer_image`/`progressive_url`, keyed by fbid) injected into a live
page after load, then scrolled. It reproduces the extension's dual capture path,
but a post-load wrap can miss the *initial* graphql burst (the real extension
wraps XHR at `document_start`), so replica numbers are a **lower bound**.

**Gate status — PARTIAL / definitive run pending.** For the authoritative
per-surface >=80% figure across Photos/Reels/Page, load the built extension
(`apps/extension/.output/chrome-mv3`, unpacked) in Chrome, open a real surface, run a full
Deep scan (its `document_start` sniffer + scroll accumulation), and read the
panel's per-item resolution. The e2e (`facebook-sniffer.spec.ts`) already proves
the mechanism deterministically on data faithful to the real `text/html` NDJSON.

## H. Instagram original-image accuracy — 2026-07-10

Measured live across 6 profile timelines (83 post-grid tiles): **~99%** of
surfaced tiles carry an original at `max(w,h) >= 1024` (83/84; the single miss a
640px tile). Instagram is **not** grid-locked like Facebook — it serves the
profile-grid images at full/near-original resolution directly in the DOM
(measured 640–4096px, overwhelmingly >=1024). The extension collects that DOM
`<img>` src as-is (the IG CDN is signed → read, never rewritten), so the surfaced
image is already the original; no graphql upgrade is needed on the grid. The IG
resolver's `image_versions2.candidates` / `video_versions` path (§B row 54) adds
value only on individual post/feed pages where a larger candidate exists than the
DOM thumbnail. No code change was warranted. Per-page detail (with handles) is
kept in a gitignored `test-samples/` file — no account identifiers here.

## I. Threads video — 2026-07-10

Threads runs on Instagram infra but delivers video differently from IG reels: a
mounted `<video>` carries a REAL https progressive `.mp4` directly in
`currentSrc` (cdninstagram, measured ~720×1280, no `blob:`, no manifest), which
the generic `collectAv` path already collects as a downloadable item — **no
sniffer needed**. Verified live: the mp4 is in **neither** the page hydration
`<script type="application/json">` **nor** the feed GraphQL responses (8
responses, 0 `video_versions`/mp4 tokens), so an IG-style GraphQL sniffer would
capture nothing. The feed/grid is virtualized — only the active tile mounts a
`<video>`; an unmounted grid/off-screen video tile exposes only its cover image,
and its mp4 is not passively reachable (the passive ceiling; forcing it would
require active auto-scroll/mount, out of scope). No production code change was
warranted; the behavior is locked in by
`apps/extension/tests/unit/extension/content/collect-threads-video.test.ts` and the e2e
`threads-video` spec. URL samples omitted (the safety filter strips CDN tokens).

## J. Popup grid render performance

**P1 (2026-07-12):** the popup's own results grid (`ImageList.tsx`) now sets
`content-visibility: auto` + a per-axis `auto <length>` `contain-intrinsic-size`
on every tile `<figure>` (falling back to a `thumbnailSize`-square box before
first paint, then self-correcting to the tile's real measured height —
thumbnail plus figcaption — once it has actually rendered), so the browser
skips layout/paint for offscreen tiles instead of rendering the whole grid up
front. Manual check at ~1000 items: the grid stays responsive to scroll with
only the near-viewport tiles doing paint work; on-screen tile appearance is
unchanged.

## K. Deep-scan collection performance

**P3 (2026-07-12):** deep-scan rounds after the seed rescan only
`MutationObserver`-reported subtrees (full walk on the seed and on the
busy-page hard cap); no change to media collected.

**P4 (2026-07-12):** deep scan now seeds its settle-time and scroll-depth from
a per-host memory of the previous run (local-only, on by default), so a repeat
visit to the same site converges without re-learning from scratch; first-visit
behavior on a new host is unchanged.
