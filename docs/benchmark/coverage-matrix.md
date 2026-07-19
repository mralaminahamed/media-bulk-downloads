# Coverage matrix (CDN family → sites)

> Part of the [Collection Benchmark](../BENCHMARK.md).

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
| 67 | Booru (Danbooru/Gelbooru/Safebooru/yande.re/Konachan) | booru image hosts (donmai.us, yande.re, konachan, gelbooru, safebooru) | **resolver** — reads the DOM's true original (`data-file-url` on Danbooru grid+post; the original-image link on Gelbooru/Moebooru post pages), element-scoped + host-pinned to the booru's own image host; grid coverage full on Danbooru, post-page on the others; network-free. Family since extended to e621ng, Gelbooru-0.2 (rule34.xxx etc.), Philomena (derpibooru etc.), and Sakugabooru image/settei posts (sample→original; its videos collect directly) | C⁵ |
| 68 | Pixiv | i.pximg.net | **resolver** — on an artwork page reads the embedded `#meta-preload-data` JSON for the exact `urls.original` (correct extension — the displayed `img-master` master is always `.jpg` even for `.png`/`.gif` uploads, so a blind rewrite would 404); multi-page derived by `_p0`→`_p<n>`; a `/c/<crop>/` feed crop of a `_master1200` master upgrades to the un-cropped master; host-pinned, network-free (pximg is `Referer`-gated — download uses the #197 referer opt-in) | C⁶ |
| 69 | Newgrounds | art.ngfiles.com | **CDN rule** — the art view page already serves the true original under `/images/…<hash>.<ext>` (collected directly; thumb→full is not derivable — the full filename carries a content hash + slug absent from the `/thumbnails/` URL), so the rule only drops the `?f<ts>` cache-buster to canonicalise for de-dupe | C⁶ |
| 70 | Wikimedia Commons (+ every wiki) | upload.wikimedia.org | **CDN rule** — drop the `/thumb/` segment + the trailing `<NNN>px-…` filename to the untouched upload; host-agnostic across all projects/wikis (2026-07-16 sweep, live-verified 330px 24 KB → 11.4 MB) | C |
| 71 | Weibo | (ww\|wx)[1-4].sinaimg.cn | **CDN rule** — first-segment size alias (`mw690`/`bmiddle`/…) → `large`; hotlink-403s without a `weibo.com` Referer (uses the #197 opt-in) (live-verified 63 KB → 143 KB) | C |
| 72 | Bilibili (images) | i[0-9].hdslb.com / *.biliimg.com | **CDN rule** — strip the `@<W>w_<H>h_…` transform suffix to the base file (covers/moments/galleries; DASH video is a separate resolver, #398) (live-verified @240w 5.7 KB → 122 KB) | C |
| 73 | Yandex / Dzen | avatars.mds.yandex.net | **CDN rule** — final size alias → `orig`, the one alias that always exists across namespaces (live-verified XXL 103 KB → 2.3 MB) | C |
| 74 | Times of India | static.toiimg.com | **CDN rule** — rebuild the `msid` `/thumb/` URL at `width-20000`; the server clamps to native resolution (also recovers the id from a `/photo/<ID>.cms` link) (live-verified 26 KB → 475 KB) | C |
| 75 | Trendyol | cdn.dsmcdn.com | **CDN rule** — strip the `/mnresize/<W>/<H>/` prefix to the origin node (filename already carries `_org`) (live-verified 3.9 KB → 59.7 KB) | C |
| 76 | Youm7 | img.youm7.com | **CDN rule** — `/small/`\|`/medium/` size dir → `/large/`; content roots (`/ArticleImgs/`, `/PlugInImages/`) untouched (live-verified 4.6 KB → 22 KB) | C |
| 77 | Imgbox | thumbs<N>.imgbox.com | **CDN rule** — `thumbs<N>` → `images<N>` host + `_t` → `_o` filename (live-verified 6.9 KB → 61.6 KB) | C |
| 78 | Globo (g1/ge/gshow) | s<N>[-<edge>].glbimg.com | **CDN rule** — widen the Thumbor edge geometry `/<W>x<H>/` → `/0x0/` (native); the embedded origin is a private bucket, so the geometry is widened not extracted (images only; Globoplay is DRM) (live-verified `/3840x0/` == `/0x0/` 712 KB) | C |
| 79 | Postimages | postimg.cc / postimages.org → i.postimg.cc | **resolver** — the displayed image + `og:image` are a downscaled render on a *different* hash (a trap); reads the `#download` button target for the true original, strips the `?dl=1` flag; host-pinned, network-free (2026-07-16 sweep) | C |
| 80 | 4chan | boards.4chan.org / boards.4channel.org → i.4cdn.org | **resolver** — the thumbnail is `<tim>s.jpg` but the full file's real ext (.png/.gif/.webm/.jpg) is only in the post's `a.fileThumb` href, so it is read not guessed; element-scoped per post; images + webm; host-pinned. Archives (desuarchive/4plebs) differ — deferred | C |
| 81 | 4kWallpapers | 4kwallpapers.com (same-origin) | **resolver** — the native max resolution is a non-standard aspect (not URL-grammar-derivable), so read the download anchors and return the largest by pixel area; same-origin host-pin, network-free | C |
| 82 | WallpapersWide | wallpaperswide.com (same-origin) | **resolver** — the offered max resolution varies per wallpaper, so enumerate the `/download/` resolutions list and return the largest by pixel area; same-origin host-pin, network-free | C |
| 83 | ImgBB | i.ibb.co (pages ibb.co) | **CDN rule** — the displayed image is already the original; grid/album thumbs append a `.md`/`.th` size suffix before the ext → drop it (og:image on the viewer page == the original, so no page resolver needed) | C |
| 84 | 4chan archives (desuarchive / 4plebs) | desu-usergeneratedcontent.xyz / i.4pcdn.org / img.4plebs.org | **resolver** (FoolFuuka) — full media (images + webm) is the `a.thread_image_link` href; element-scoped per post, host-pinned per archive. Selectors from the FoolFuuka theme, not a live capture (archives 403 bots) → fail-closed, needs-live-confirmation | C |
| 85 | VSCO | im.vsco.co (pages vsco.co) | **CDN rule** — strip the `?w=/dpr` resize query to the bare master (the URL the page's `__PRELOADED_STATE__` exposes as `responsiveUrl`). Browser-verified (CDN bot-blocks curl). Video (mp4/HLS on img.vsco.co) via the A/V path — HLS deferred | C |
| 86 | Saatchi Art | images.saatchiart.com (pages saatchiart.com) | **CDN rule** — swap the trailing `-<N>.jpg` size token to `-8` (largest offered, present in the DOM; og:image is `-7`). Verified -7 46 KB → -8 237 KB | C |
| 87 | WEBTOON (LINE Webtoons) | [s]webtoon-phinf.pstatic.net (pages webtoons.com) | **CDN rule** — panel `data-url` (now read by the lazy collector) carries `?type=q90`; strip it → original (q90 57 KB → 159 KB). Hotlink-gated → needs the webtoons.com Referer (#197 opt-in) | C |
| 88 | Pikabu | cs*.pikabu.ru (pages pikabu.ru) | **resolver** — reads the `/big/` original from `a.story-image__link`, element-scoped, host-pinned. Selectors from a community userscript (site is DDoS-Guard walled) → fail-closed, needs-live-confirmation. Video (converted webm/gif) is a direct-file A/V case | C |
| 89 | Tapas | us-a.tapas.io (pages tapas.io) | **free-ride** — the panel `data-src` (read by the lazy collector) is the full-size signed CDN URL, used verbatim (Akamai `__token__`, expires; keep intact). Free/unlocked episodes only | C |
| 90 | Pixelfed (fediverse, host-agnostic) | */m/_v2/*_thumb.<ext> (any instance / pxscdn.com) | **CDN rule** — strip `_thumb` before the ext on the `/m/_v2/` media path; works on self-hosted `/storage/` and the CDN alike (API `url`/og:image are the bare original). Verified 143 KB → 345 KB | C |
| 91 | Misskey / Sharkey (fediverse, host-agnostic) | */proxy/<name>.webp?url= / proxy.misskeyusercontent.jp | **de-proxy** — unwrap the media proxy's `url=` param (or misskey.io's path-encoded original); runs before the MEDIA_EXT guard since the proxy path ends in `.webp`. `files[].url` is already the original. Verified 16 KB → 105 KB | C |
| 92 | Lemmy / pict-rs (fediverse, host-agnostic) | */pictrs/image/* (any instance) | **CDN rule** — strip the pict-rs `?thumbnail/?format` resize query → stored original. Current 0.19.x separate-UUID thumbs aren't param-addressable (API `post.url` is the original); `image_proxy?url=` is unwrapped by the generic de-proxy | C |
| 93 | Shopee | down-{cc}.img.susercontent.com | **CDN rule** — strip the `_tn` / `@resize_w<N>_nl` suffix on a `/file/<hash>` key → bare original. Host-agnostic across the regional `down-*` hosts. Verified 13/21 KB → 91 KB | C |
| 94 | Mercado Libre | http2.mlstatic.com | **CDN rule** — rewrite the trailing size code (`O/OO/V/W/AB/F`) to `-F.jpg` (Full = largest; JPG beats WebP and ignores the `D_NQ_/2X` prefix). Verified `-AB.webp` 21 KB → `-F.jpg` 211 KB | C |
| 95 | Tokopedia | images.tokopedia.net | **CDN rule** — drop the `/img/cache/<size>/` resizer segment → stored original. Verified 42 KB → 621 KB | C |
| 96 | Hepsiburada | productimages.hepsiburada.net | **CDN rule** — pin the `/s/<store>/<SIZE>/` path segment to `2000` (CDN cap; 2560+ 404). Verified 550 17 KB → 2000 86 KB | C |
| 97 | Leboncoin | img.leboncoin.fr | **CDN rule** — `?rule=<name>` → `ad-large` (named size, no HMAC). Verified 8 KB → 263 KB | C |
| 98 | Meesho | images.meesho.com | **CDN rule** — `?width=<N>` → 2000 (overrides the `_NNN` filename token, clamps to ~1200px native). Verified 58 KB → 122 KB | C |
| 99 | Domestika | imgproxy.domestika.org | **CDN rule** — UNSIGNED imgproxy `/unsafe/<opts>/plain/src://…`: drop the `w:/rs:/dpr:` processing opts → the untouched `-original` source. Verified 30 KB → 161 KB | C |
| 100 | Sahibinden | i{N}.shbdn.com | **CDN rule** — pin the `/photos/dd/dd/dd/` filename prefix to `x5_` (thmb_ < bare < x5_; orj_ blocked). Not signed. Verified thmb_ 6 KB → x5_ 65 KB | C |
| 101 | Wattpad | img.wattpad.com | **CDN rule** — pin the cover width token to `512` (max; unlisted widths fall back to the 256 baseline, so set exactly, don't strip). Verified 23 KB → 77 KB | C |
| 102 | Naver Blog | postfiles / mblogthumb-phinf.pstatic.net | **CDN rule** — `?type=w<N>` → `w3840` (large whitelisted width, clamps to native). Stripping `?type` returns a 4.5 KB placeholder, so bump rather than strip (contrast row 87 WEBTOON). Verified w773 93 KB → w3840 315 KB | C |
| 103 | Lofter | imglf{N}.lf127.net | **CDN rule** — drop the entire NetEase-NOS `?imageView&thumbnail=…&quality=…` query → original (corroborated by gallery-dl's `lofter.py`). Verified 77 KB → 209 KB | C |
| 104 | nostr.build | image.nostr.build | **CDN rule** — strip the `/thumb/` and `/resp/<size>/` path segments → the bare `<sha256>.<ext>` original (bare-hash URLs clients embed are already originals = free-ride). Verified /thumb/ 9 KB → 82 KB | C |
| 105 | Wallpapers.com | wallpapers.com (BunnyCDN /images/) | **CDN rule** — size is a path segment (thumbnail < high < hd); swap `/images/(thumbnail\|high)/` → `/images/hd/` (largest = og:image), extension preserved. No signing; larger speculative segments 404. Verified 11 KB → 319 KB | C |
| 106 | WallpaperAccess | wallpaperaccess.com | **CDN rule** — swap `/thumb/<id>.<ext>` → `/full/<id>.<ext>`, gated to the image path so the `/download/<slug>-<id>` HTML route is never touched. No signing; HTML pages Cloudflare-gated but the image host is open. Verified 32 KB → 797 KB | C |
| 107 | Rutube | rutube.ru (watch/embed) → bl.rutube.ru (HLS) | **resolver** (opt-in **N**) — 32-hex id from the watch URL → `api/play/options` → `video_balancer.m3u8`, the unsigned `bl.rutube.ru` master (balancer signs the variants), pinned to `rutube.ru`. HLS-only; no auth for public videos; adult/geo-gated not circumvented | N |
| 108 | Rumble | rumble.com (watch/embed) → rumble.com/1a-1791.com (HLS) | **resolver** (opt-in **N**) — hint carries the rumble.com-pinned URL; derive the embed id from `/embed/<id>/` or the open oEmbed endpoint (watch HTML is Cloudflare-gated, JSON APIs open), then read the `embedJS/u3` `ua.hls.auto.url` master, pinned to the Rumble-CDN allowlist. HLS-only (no progressive mp4 in 2026); unsigned | N |
| 109 | PeerTube | any instance (watch/embed) → instance / `media.*` object storage / federated instance | **resolver** (opt-in **N**, host-agnostic like Mastodon) — hint carries the canonical `/videos/embed/<id>` URL; confirm the host is PeerTube via `/api/v1/config` (`serverVersion`) before fetching `/api/v1/videos/<id>`, then take the widest direct `fileUrl` (progressive + per-rendition HLS lists) or the `streamingPlaylists[0].playlistUrl` master. Media host is variable (remote object storage / federated), so it can't be fixed-pinned — the instance request AND every returned URL pass `isSafeCaptureUrl()` (SSRF). Public unsigned; private/password/internal → none | N |
| 110 | News24 | news24cobalt.24.co.za | **CDN rule** — strip the `/format/<crop>/` segment (`smallThumb`/`mediumThumb`/`largeThumb`/`inline`/…) from `/resources/<id>/format/<crop>/<file>` → the bare full-resolution original (crop-name-independent, unsigned). The `<id>`'s trailing `-1000` is an opaque resource marker, NOT a width (a `-2000` bump 404s); the size lives in the crop, and the bare path returns the stored source. Verified inline 1080×720 93 KB → bare 4000×2667 1.5 MB. No-`/format/` URLs (SVG placeholder / already-bare) untouched. Corrects the batch-2 deferral (og/inline was NOT the largest) | C |
| 111 | Sabq | media.sabq.org + imagedelivery.net | **free-ride** — the batch-2 gumlet premise is stale (site migrated to a bespoke SPA). `media.sabq.org/news/<Y>/<M>/<uuid>/w<width>.webp` serves each image at its **stored native width** (arbitrary per image; every larger width, `/original`, bare path, and `.jpg` all 404 — verified w640→960/1280/1600 404, w902→1200/1600 404), and `imagedelivery.net/<hash>/<id>/public` (Cloudflare Images) delivers `public` as the largest (`original` variant 403, flexible `w=` off). Both are already originals — collected verbatim, no rule applies | C |
| 112 | Coub | coub.com (view) → attachments-cdn-s.coub.com | **collect (network-free)** — the watch page embeds the clip object in `<script id="coubPageCoubJson">`; collect.ts parses it and surfaces `file_versions.share.default`, a single combined audio+video mp4 (no HLS/mux), host-pinned to the coub.com CDN family. Keyed by permalink; poster from `picture`. Unsigned, no referer/auth. Embeds on third-party pages (no page JSON) are a follow-up | L |
| 113 | Loom | loom.com (share/embed) → cdn.loom.com / luna.loom.com | **resolver** (opt-in **N**) — 32-hex id from the share/embed URL; `POST campaigns/sessions/<id>/transcoded-url` (unauthenticated) → the CloudFront-signed `cdn.loom.com` mp4 (direct, time-signed → resolved on demand). A 204 (no transcoded render) falls back to `raw-url` → the `luna.loom.com` HLS master. Both hosts pinned to loom.com; workspace-restricted looms 401/403 → null | N |
| 114 | AnimePictures | anime-pictures.net (post) → opreviews (preview) / api.anime-pictures.net (original) | **resolver** (login-gated, network-free) — post page shows only a downscaled `opreviews.anime-pictures.net/<md5[0:3]>/<md5>_bp.avif` preview; the true original is NOT a public md5 path (the batch premise was wrong) but the session-gated `pictures/download_image/<slug>` endpoint the page's own download `<a>` links. Reads that href from the DOM (only for the main image — md5 must match og:image, so related-post thumbs aren't mis-mapped), pins to `anime-pictures.net`. The browser download carries the user's cookie (logged in → 200 full-res; logged out → 403, no circumvention). Verified live 319×600 preview → 2177×4096 original | L |
| 115 | Pixiv Fanbox | *.fanbox.cc (post) → downloads.fanbox.cc | **collect (network-free)** — a post page's visible `<img>` are lazy/icon-only, but every full-res original (`downloads.fanbox.cc/images/post/<postId>/<key>.<ext>`, matching `api.fanbox.cc/post.info`'s `imageMap`) is present in the hydrated markup. collect.ts scrapes them scoped to the URL's `<postId>` (so a related-post preview can't leak in), one candidate per image. Free posts public; a paid post the viewer can't access renders no originals → [] (fails closed). Hotlink-protected → download via the #197 Referer opt-in (page URL as Referer). Verified live | L |

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
¹/§D) were already covered, so #286 added no rule for them. **Sankaku** Tier-1
shipped (#319): its tiers share an md5 content-hash, so an opened post's
already-signed original is collected and its preview folds by md5 (passive,
no-auth); grid-only originals still need the opt-in authenticated Tier-2 (#319).
**Xiaohongshu / RED** Tier-1 shipped (#405), Sankaku-Tier-1-style: a note's
cover/detail renditions and every re-sign share the fileId `<bucket>/<token>` in
their signed `xhscdn.com` path, so RED media URLs are claimed, https-upgraded,
and fold to one row by fileId — the largest, displayed `WB_DFT` rendition wins
(passive, no-auth; the displayed image is already the ceiling, so this is a
dedup fold, not an upgrade). Video notes are out of scope; a larger,
un-watermarked original would need the opt-in authenticated Tier-2.
