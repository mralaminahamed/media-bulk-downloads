# Benchmark changelog

The running log of coverage gaps this benchmark **drove to a fix** — new/changed
CDN-upgrade rules and resolvers, corrections, and reverts. Split out of
[BENCHMARK.md](../BENCHMARK.md) so that doc stays focused on the live measurement
tables and the gaps still open; the user-facing release history lives in the
top-level [CHANGELOG.md](../../CHANGELOG.md).

Entries are grouped **Resolved / Corrected / Reverted**; dates (where present) are
when the fix shipped. This is an engineering record, not a release changelog.

Resolved (this benchmark drove the fixes):
- ✅ **Tier-1 sweep batch 2 (2026-07-16)** — twelve passive CDN rules in
  `imageUrl.ts`, each curl-verified against a real (SFW) asset before shipping
  (#370/#371/#376/#377/#378/#379/#383/#390/#392/#399/#409/#421):
  - **Shopee** (#370) — strip the `_tn` / `@resize_w<N>_nl` suffix on a
    `/file/<hash>` key → bare original. Host-agnostic across `down-{cc}.img.susercontent.com`.
    Verified 13/21 KB → 91 KB.
  - **Mercado Libre** (#371) — rewrite the trailing size code (`O/OO/V/W/AB/F`) to
    `-F.jpg` (Full, largest; the JPG beats the WebP and ignores the `D_NQ_/2X` prefix).
    Verified `-AB.webp` 21 KB → `-F.jpg` 211 KB.
  - **Tokopedia** (#376) — drop the `/img/cache/<size>/` resizer segment. Verified 42 KB → 621 KB.
  - **Hepsiburada** (#377) — pin the `/s/<store>/<SIZE>/` segment to `2000` (CDN cap;
    2560+ 404). Verified 550 17 KB → 2000 86 KB.
  - **Leboncoin** (#378) — `?rule=<name>` → `ad-large` (named size, no HMAC). Verified 8 KB → 263 KB.
  - **Meesho** (#379) — `?width=<N>` → 2000 (overrides the `_NNN` filename token,
    clamps to ~1200px native). Verified 58 KB → 122 KB.
  - **Domestika** (#383) — an UNSIGNED imgproxy `/unsafe/<opts>/plain/src://…` URL:
    drop the `w:/rs:/dpr:` processing opts → the untouched `-original` source. Verified 30 KB → 161 KB.
  - **Sahibinden** (#390) — pin the `/photos/dd/dd/dd/` filename prefix to `x5_`
    (thmb_ < bare < x5_; orj_ is blocked). Not signed. Verified thmb_ 6 KB → x5_ 65 KB.
  - **Wattpad** (#392) — pin the cover width token to `512` (max; unlisted widths fall
    back to the 256 baseline, so set it exactly rather than strip). Verified 23 KB → 77 KB.
  - **Naver Blog** (#399) — `?type=w<N>` → `w3840` on `postfiles`/`mblogthumb-phinf.pstatic.net`.
    CORRECTION vs the sweep's "strip like WEBTOON" note: stripping `?type` returns a
    4.5 KB placeholder, so bump to a large whitelisted width (clamps to native) instead.
    Verified w773 93 KB → w3840 315 KB.
  - **Lofter** (#409) — drop the entire NetEase-NOS `?imageView&thumbnail=…&quality=…`
    query on `imglf<N>.lf127.net` (corroborated by gallery-dl's `lofter.py`). Verified 77 KB → 209 KB.
  - **nostr.build** (#421) — strip the `/thumb/` and `/resp/<size>/` path segments →
    the bare `<sha256>.<ext>` original (what clients embed is already the original =
    free-ride). Verified /thumb/ 9 KB → 82 KB.
  - **Catbox** (#422) — free-ride: `files.catbox.moe/<id>.<ext>` is always the raw
    upload (no thumbnail/resize variants exist), so it needs no rule — just recognition.
  - Deferred from this batch: **Der Spiegel** (#380, per-image width whitelist — needs
    srcset reading, not a strip), **Pinkvilla** (#382, `-sq` crop is already full-res;
    the hero is a separately-named file, not suffix-derivable), **UOL** (#389, could not
    sample a real content photo — avatars only), **Onedio** (#391, HMAC-**signed** size
    params — any edit 404s), **Sabq** (#394, `gumlet.assettype.com` 403s datacenter
    requests — transform unverified), **News24** (#395, `news24cobalt.24.co.za` per-image
    discrete renditions — the og rendition is already the largest generated).
- ✅ **Fediverse trio (2026-07-16)** — one host-agnostic rule per network in
  `imageUrl.ts` (matched on the media path across any instance, like the Mastodon
  resolver), each curl-verified on live public instances (#406/#410/#411):
  - **Pixelfed** (#406) — CdnRule: strip `_thumb` before the extension on a
    `/m/_v2/` media path. Host-agnostic — works on self-hosted `/storage/m/_v2/`
    *and* the `pxscdn.com` `/public/m/_v2/` CDN; the `/m/_v2/` gate + underscore-free
    base62 filenames make `_thumb` unambiguous. Verified 143 KB → 345 KB. The API/AP
    `url`, og:image, and single-post view already serve the bare original (free-ride).
  - **Misskey / Sharkey** (#410) — `deproxy()` branch: unwrap the media proxy to the
    real original. Two shapes — `<instance>/proxy/<name>.webp?url=<encoded>` (the
    proxy path deceptively ends in `.webp`, so this runs *before* the MEDIA_EXT
    guard) and misskey.io's `proxy.misskeyusercontent.jp/(image|static)/<path-encoded>`.
    A note's own `files[].url` is already the original (free-ride). Verified proxy
    16 KB → original 105 KB.
  - **Lemmy / pict-rs** (#411) — CdnRule: strip `?thumbnail=/?format=` from a
    `/pictrs/image/` URL → the stored original in its own format. NOTE: current
    0.19.x mostly uses *separate-UUID* thumbnails (not param-addressable — the API's
    `post.url` is the bare original there) or an `/api/v3/image_proxy?url=` wrapper
    (already unwrapped by the generic de-proxy — regression-tested), so this rule
    covers the legacy / param-carrying case. Verified: pict-rs honours the params
    (thumbnail=256 = 11 KB) and the bare path is the 577 KB original.
- ✅ **Tier-2 sweep batch 2 (2026-07-16)** — the six publicly-verifiable tier-2
  candidates (#384/#386/#388/#393/#403/#417), characterized against real pages;
  most collapsed to simpler layers than the "DOM resolver" label suggested:
  - **VSCO** (#384) — CDN rule on `im.vsco.co`: the display is `<responsiveUrl>?w=&dpr=`
    (the master URL is exposed in the page's `__PRELOADED_STATE__`), so strip the
    resize query. Browser-verified (the CDN bot-blocks curl). Video (`img.vsco.co`
    mp4 / m3u8) goes through the A/V path — HLS items are NEEDS-NETWORK, deferred.
  - **Saatchi Art** (#393) — CDN rule on `images.saatchiart.com`: swap the trailing
    `-<N>.jpg` size token to `-8` (largest offered, already present in the DOM;
    og:image is `-7`). Verified -7 46 KB → -8 237 KB.
  - **WEBTOON** (#403) — CDN rule on `[s]webtoon-phinf.pstatic.net`: strip the
    `?type=q90` recompress (verified q90 57 KB → original 159 KB). The panel's real
    URL lives in `data-url`, now added to the lazy-attr collector (`extract.ts`);
    pstatic hotlink-403s without a webtoons.com Referer, covered by the #197 opt-in.
  - **Tapas** (#417) — **free-ride, already covered**: the panel `data-src` (read by
    the existing lazy collector) is the full-size signed CDN URL (`us-a.tapas.io`,
    Akamai `__token__`), which must be used verbatim (the token is the gate and
    expires). No code needed; only free/unlocked episodes render panels.
  - **Pikabu** (#386) — `pikabu.ts` story-image resolver: reads the `/big/` original
    from `a.story-image__link`, host-pinned to cs*.pikabu.ru, element-scoped. The
    site is DDoS-Guard walled (blocks server AND headless fetch), so the selectors
    are from the community userscript, not a live capture — **needs-live-confirmation,
    fail-closed** (a miss returns [], the displayed image still downloads). Video
    (converted GIF/webm) is a direct-file A/V case, out of scope here.
  - **Coub** (#388) — **deferred**: `#coubPageCoubJson` → `file_versions.share.default`
    is a single combined mp4, but it's *video*, which is collected by the A/V path,
    not the resolver registry — so it needs a `collect.ts` push (à la Vimeo/Dailymotion)
    reading the JSON, a separate change. Left open.
- ✅ **4chan archives — FoolFuuka resolver (2026-07-16)** — `foolfuuka.ts` covers
  **desuarchive.org** (CDN `desu-usergeneratedcontent.xyz`) and **archive.4plebs.org**
  (CDN `i.4pcdn.org` / `img.4plebs.org`), the archive half deferred from #402 (→ #426).
  A different engine + per-archive CDN than boards.4chan.org, so gated + host-pinned
  separately: each post's full media (images + webm) is the href of
  `a.thread_image_link` (which wraps the lazyloaded `img.post_image` thumbnail),
  read **element-scoped** so a thread resolves each thumb to its own post. Selectors
  confirmed against the FoolFuuka default theme (`board_comment.php`), NOT a live DOM
  capture — the archives 403 server-side fetchers, so it is **fail-closed** and
  needs-live-confirmation: a miss (wrong selector / off-CDN href) returns `[]`, never
  a bad URL. Media hosts verified reachable.
- ✅ **Tier-2 site-coverage sweep resolvers (2026-07-16)** — four network-free DOM
  resolvers + one CDN rule, each confirmed against a real live page (issues
  #413/#414/#402/#418/#420); a new `resolvers/sites/pageOriginal.ts` holds the
  shared `pageHost`/`pinnedDomUrl`/`kindFromExt` helpers these page-host-gated
  resolvers use:
  - **Postimages** (`postimages.ts`, page hosts `postimg.cc`/`postimages.org`) —
    the viewer's displayed image AND `og:image` are a downscaled render on a
    *different* hash, so both are a trap; the true original is the `#download`
    button's `i.postimg.cc` target (the `?dl=1` attachment flag is stripped).
    Host-pinned to `postimg.cc`.
  - **4chan** (`fourchan.ts`, page hosts `boards.4chan.org`/`boards.4channel.org`)
    — a thumbnail is `<tim>s.jpg` but the full file's real extension
    (.png/.gif/.webm/.jpg) lives ONLY in the post's `a.fileThumb` href, so it is
    read, never guessed; **element-scoped** to the collected thumb's own post so a
    multi-post thread doesn't pin every image to the first file. Images + webm.
    Host-pinned to `4cdn.org`. Archives (desuarchive/4plebs) use a different
    engine + CDN — deferred.
  - **4kWallpapers + WallpapersWide** (`wallpaperhosts.ts`) — the native max
    resolution is a non-standard aspect, unique per wallpaper and NOT derivable by
    URL grammar, so the resolver enumerates the page's download anchors and returns
    the largest by pixel area (same-origin, host-pinned to the page host).
  - **ImgBB** (`imageUrl.ts` CDN rule, `i.ibb.co`) — the displayed image is already
    the no-suffix original; grid/album thumbnails append `.md`/`.th` before the
    extension, so drop it. Reclassified from the filed Tier-2 label to a Tier-1
    rule after the probe showed `og:image` == the original (#413).
- ✅ **Tier-1 site-coverage sweep CdnRules (2026-07-16)** — nine passive host rules
  in `imageUrl.ts`, surfaced by a multi-agent popularity sweep (issues #367-#412)
  and each live-probed this session for a real thumbnail→original byte delta before
  shipping:
  - **Wikimedia Commons** `upload.wikimedia.org` — drop the `/thumb/` segment + the
    trailing `<NNN>px-…` filename to the untouched upload; host-agnostic across every
    wiki/project and thumb-filename variant (330px 24 KB → original 11.4 MB).
  - **Weibo** `(ww|wx)[1-4].sinaimg.cn` — swap the first-segment size alias (`mw690`,
    `bmiddle`, …) → `large` (`woriginal` left alone). Needs a `weibo.com` Referer to
    download (hotlink-403), supplied by the opt-in Referer retry #197.
  - **Bilibili** `i[0-9].hdslb.com` / `*.biliimg.com` — strip the `@<W>w_<H>h_…`
    transform suffix to the base file (@240w 5.7 KB → base 122 KB). DASH video is a
    separate heavier resolver (#398).
  - **Yandex/Dzen** `avatars.mds.yandex.net` — final size alias → `orig`, the one
    alias that always exists (XXL 103 KB → orig 2.3 MB).
  - **Times of India** `static.toiimg.com` — rebuild the `msid` thumb at
    `width-20000` (server clamps to native; width-600 26 KB → native 475 KB).
  - **Trendyol** `cdn.dsmcdn.com` — strip the `/mnresize/<W>/<H>/` prefix to the
    origin node (3.9 KB → 59.7 KB).
  - **Youm7** `img.youm7.com` — `/small/`|`/medium/` size dir → `/large/` (content
    roots `/ArticleImgs/`, `/PlugInImages/` left untouched).
  - **Imgbox** `thumbs<N>.imgbox.com` — `thumbs<N>` → `images<N>` and `_t` → `_o`
    (6.9 KB → 61.6 KB).
  - **Globo** `s<N>[-<edge>].glbimg.com` — widen the Thumbor edge geometry
    `/<W>x<H>/` → `/0x0/` (native). The embedded origin is a **private** bucket
    (`i.s3.glbimg.com` unreachable), so the geometry is widened rather than the URL
    extracted — the sweep's proposed "extract embedded URL" was rejected on probe.
  - Deferred: **LiveJournal** `ic.pics.livejournal.com` `_<size>`→`_original` — the
    upgrade is real (48 KB → 283 KB) but `_original` **404s** on the minority of
    uploads stored only at a capped size, and a passive sync rule can't fall back;
    it belongs in the opt-in network-probe tier (#381 kept open).
- ✅ **Sakugabooru (2026-07-16)** — added to the booru resolver family
  (`resolvers/sites/booru.ts`). This Moebooru-skinned, video-first site was a
  deferred gap (#350): its video posts already collected fine (the `<video>`
  `<source>` already points at the original `/data/<hash>.mp4`, verified equal to
  the `#highres` link across live posts — no resolver needed), but its image/settei
  posts serve a `/data/sample/` downscale in `#image` and link the real original
  via `a.original-file-changed#highres` (a larger file, sometimes a different
  format — e.g. a 4.99 MB PNG behind a sample JPG). Registering both host forms
  (`www.` + bare) and teaching the existing Moebooru branch the `-changed` link
  class closes it. Host-pinned to the site's own domain; live DOM captured
  2026-07-16.
- ✅ **Shopify product-page resolver (2026-07-16)** — beyond the passive image
  upgrade (`_WxH`/`?width=` strip, benchmarked 75/75 on Allbirds), a dedicated
  resolver now surfaces the **complete** product media set from the store's public,
  same-origin `/products/<handle>.js` endpoint: every variant image plus **product
  videos** (highest-res mp4, else the HLS master), with the preview as poster.
  Detected from the page's `cdn.shopify.com` / `/cdn/shop/` assets (Shopify has no
  fixed host), fetched credential-free and time-bounded in the content-script
  GET_IMAGES prelude, then read synchronously by `shopifyPageMedia` — the same
  sniffer→ingest→pageMedia shape as pinterest/instagram/facebook. Untrusted JSON:
  every URL host-pinned to the Shopify CDN families or the page's own origin;
  external_video (YouTube/Vimeo) and 3D models skipped.
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
  - **RedGifs media** was the only member of this batch that was previously called
    infeasible — the #197 hotlink path is what makes it shippable.
- ✅ **Twitch clips resolver (#354, 2026-07-16)** — a `clips.twitch.tv/<slug>`, a
  channel `twitch.tv/<ch>/clip/<slug>` permalink, or an embed player's `?clip=<slug>`
  (link or `<iframe>`) surfaces a pending video (`resolveHint 'twitch'`). The opt-in
  resolve pass does one GraphQL persisted-query POST to `gql.twitch.tv/gql`
  (`Client-ID` header — an allowed custom header) for the clip's playback access token
  + mp4 renditions, signs the highest-resolution `sourceURL` with `?sig=&token=`, and
  returns it host-pinned to Twitch's clip CDNs (`.twitchcdn.net` / `.twitch.tv`). The
  token is used only to build that URL and never logged/persisted. The operation name,
  `sha256Hash`, and Client-ID are externalized to `resolvers/twitch-constants.ts` so
  they can be bumped without a logic change when Twitch rotates them (the op has
  migrated before: `VideoAccessToken_Clip` → `ShareClipRenderStatus`). Any missing
  field — private/expired clip, or a rotated op the request no longer matches —
  resolves to null (fail-closed: never a URL that would 403/404). *The GQL chain is
  implemented from the documented (yt-dlp/streamlink) shape against a crafted fixture;
  the live op/hash still wants a real-clip confirmation.*
- ✅ **9GAG resolver (#354, 2026-07-16)** — a `9gag.com/gag/<id>` post that carries a
  `<video>` (a video/GIF post) surfaces a pending video (`resolveHint '9gag'`). The
  resolve pass is network-free (like reddit): the post file is id-derived and unsigned,
  so the universal H.264 rendition `img-9gag-fun.9cache.com/photo/<id>_460sv.mp4` is
  rebuilt straight from the id, host-pinned to `9cache.com`. The image-vs-video
  disambiguation that deferred this — an image post must never become a would-404
  `_460sv.mp4` — is handled **by construction**: collect.ts emits the hint only when the
  post's own container (`<article>` / `jsid-post-<id>`, never a page-wide wrapper) holds a
  `<video>`, so an image post (no `<video>`, file `<id>_700.jpg`) can't fire. If neither
  per-post container matches the live markup, the feature stays inert rather than guess.
  *The `_460sv.mp4` shape is from the documented 9cache scheme; 9GAG's exact post markup
  wants a live confirmation to widen the container match if needed.*

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
