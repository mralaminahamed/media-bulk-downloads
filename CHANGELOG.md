# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Helpful empty state when filters hide everything.** If the active filters leave
  nothing to show — e.g. you filtered to *not-downloaded* and then downloaded all of
  them — the grid no longer goes blank. It now explains how many items are hidden
  (and, when it applies, that you've downloaded everything that matched) and offers
  **Clear filters** and **Deep scan** right there.
- **PornPics full-size images.** Gallery thumbnails on `cdni.pornpics.com` now
  upgrade from the on-page `460`-wide preview to the full `1280` rendition — a
  host-scoped CDN rule that rewrites the leading size segment. Byte-verified ~3–9×
  larger; leaves images already at `1280` untouched.
- **Reset settings & clear all data.** The Settings → **Data** tab now has two
  destructive controls, each guarded by a two-step inline confirm: **Reset settings**
  restores every setting to its default (your favourites, history, and blocked
  sources are kept), and **Clear all data** permanently deletes your favourites,
  download history, and blocked sources (your settings are kept). Everything stays
  on your device.
- **Filter by fetched / not-fetched.** A new **Fetched** chip in the filter bar lets
  you show only items whose real media is resolved and directly downloadable
  (*Fetched*) or only poster-only items still awaiting the opt-in network resolve
  (*Not fetched*). The chip appears only when the page has pending items, and clears
  itself once everything has resolved.
- **VK photo originals.** Photos on VK's signed `userapi.com` CDN now upgrade to
  their native resolution — the extension drops the `cs=` display-cap while keeping
  the URL's signature, so you get the full-size upload instead of the on-page
  preview. Host-agnostic CDN rule; leaves old path-based renditions untouched.
- **Kick clips & VODs.** Kick clip and VOD links now resolve to their real media
  via the opt-in network tier — a clip to its MP4 (`api/v2/clips/<id>/play`), a VOD
  to its HLS master (`api/v1/video/<uuid>`), both host-pinned to `*.kick.com`.
  Mirrors the existing Twitch resolver. Fails closed on private/expired media.
- **Odnoklassniki (ok.ru) videos.** Open a video on `ok.ru` and the extension now
  lists the full-quality MP4 — it reads the page's own player metadata
  (`data-options`) and picks the highest available progressive rendition, pinned to
  the OK video CDN. Network-free; live-only streams are skipped.
- **Itaku originals.** Art images on `itaku.ee` now upgrade from the sized
  thumbnail to the full original.
- **Inkbunny originals.** Art images on Inkbunny now upgrade from the on-page
  screen rendition to the full original (`/files/screen/` → `/files/full/`).
- **WikiArt originals.** Fine-art images on `wikiart.org` now upgrade from the
  page's largest displayed size (`!HD`) to the un-suffixed full original — several
  times larger — by stripping WikiArt's `!SizeCode` rendition suffix.
- **Steam screenshots & artwork.** Community images on
  `images.steamusercontent.com` now upgrade to the full-quality original — the
  extension drops Steam's on-the-fly resize/letterbox so you get the source upload,
  not the downscaled preview.
- **MangaDex chapters.** Open a chapter on `mangadex.org` and the extension now
  lists **every page** of that chapter at full resolution (the original PNG, ~9×
  larger than the reader's compressed preview) — no scrolling through the reader.
  It reads the page list from the reader's own chapter request (nothing extra is
  fetched or sent), and only on a `/chapter/<id>` page.
- **Support / donate button.** A highlighted rose heart now sits beside the
  Favourites star in the popup and on-page-bubble header, linking to
  `https://alaminahamed.com/donate`. It opens in a new tab from either surface
  (a plain `<a>`, so it works in the bubble content script where `chrome.tabs`
  is unavailable), and honours `prefers-reduced-motion` — the gentle heartbeat
  is dropped, the highlighted pill stays.
- **Pornhub videos.** On a Pornhub watch/embed page (`pornhub.com/view_video.php?viewkey=…`,
  `/embed/<id>`) the extension now surfaces the HLS master stream — the
  `format:"hls"` `videoUrl` in the page's inline `flashvars_<id>` object, on
  `*.phncdn.com` — one adaptive manifest that carries every quality, routed through
  HLS capture. Network-free; the mp4 `get_media` entry (needs a signed fetch) is
  skipped, and an obfuscated/paid page shows nothing (fails closed). Referenced from
  gallery-dl for the flashvars key names.
- **szurubooru posts.** On a szurubooru post page (snootbooru.com,
  booru.bcbnsfw.space, `/post/<id>`) the extension now surfaces the post's original —
  the distinctive `/data/posts/<id>_<hash>.<ext>` file the Vue SPA can otherwise hide
  behind its virtualized viewer — read from the rendered page, same-host-pinned.
  Network-free; an unrendered/removed post shows nothing (fails closed).
- **imgpile posts.** On an imgpile post page (`imgpile.com/p/<slug>`) the extension now
  surfaces every image/video in the post — each `post-media` block's `<a href>`
  full-resolution original — read straight from the page. Network-free; a post with no
  accessible media shows nothing (fails closed).
- **Simple image hosts.** One shared reader now surfaces the full-resolution original
  from a family of image-host single-image pages — ImageBam, ImageVenue, PixHost,
  ImageTwist/ImageHaha, imgspice, imgpv, picstate, and imgdrive/imgtaxi/imgwallet —
  reading it straight from the page (`og:image`, a specific `<img>`, or a CDN `<img>`),
  same-site-pinned. Network-free; a non-image or gate page shows nothing (fails closed).
- **Lensdump images.** On a Lensdump image page (`lensdump.com/i/<id>`) the extension
  now surfaces the full-resolution original from the page's `og:image` (validated as a
  plaintext image on the Lensdump CDN). Network-free; fails closed otherwise.
- **Motherless media.** On a Motherless media page (`motherless.com/<id>`) the
  extension now surfaces the file (image/gif/video) from the page's `__fileurl`,
  pinned to the Motherless CDN. Network-free; a gallery/listing shows nothing (fails
  closed).
- **XVideos videos.** On an XVideos watch page (`xvideos.com/video<id>/…`) the
  extension now surfaces the direct mp4 stream, read from the page's own inline
  `html5player.setVideoUrlHigh(...)` call and pinned to the XVideos CDN. Network-free;
  a removed/geo-blocked page shows nothing (fails closed).
- **xHamster videos.** On an xHamster watch page (`xhamster.com/videos/<slug>-<id>`,
  plus mirror hosts) the extension now surfaces the highest-quality mp4 from the page's
  `window.initials` JSON (`videoModel.sources`), pinned to `*.xhcdn.com`. Network-free;
  a page with no usable source shows nothing (fails closed).
- **Imgur posts, albums & galleries.** On an Imgur post page (`imgur.com/<id>`,
  `/a/<id>`, `/gallery/<id>`) the extension now surfaces every item's original on
  `i.imgur.com`, read from the post JSON the page assigns to `window.postDataJSON`
  (covers albums the DOM lazy-loads). Network-free; a removed/empty post shows
  nothing (fails closed). Referenced from gallery-dl; imgur verified live.
- **Tenor GIFs.** On a Tenor view page (`tenor.com/view/<slug>-<id>`) the extension
  now surfaces the animated GIF original (else the muxed mp4/webm) on
  `media.tenor.com`, read from the page's `store-cache` JSON. Network-free.
  Referenced from gallery-dl; verified live.
- **Pexels photos & videos.** On a Pexels photo/video page the extension now
  surfaces the free full-resolution original (`images.pexels.com` /
  `videos.pexels.com`) from the page's `__NEXT_DATA__`. Read same-origin in the page
  (the site is Cloudflare-gated, so a background fetch can't). Network-free.
  Referenced from gallery-dl.
- **Civitai originals.** Civitai image URLs (`image.civitai.com/…/<transform>/…`)
  now upgrade to the un-resized original — the resize/anim transform segment is
  rewritten to `original=true` — so a collected thumbnail resolves to full size. A
  URL already at `original=true` is left untouched.
- **Fapello posts.** On a Fapello post page (`fapello.com/<model>/<id>/`, also `.su`)
  the extension now surfaces that post's media — the image (with the `.md`/`.th`
  thumbnail suffix stripped to the original) or the video with its poster — read
  from the page's own `uk-align-center` block. Network-free; a listing or an
  inaccessible post shows nothing (fails closed). Referenced from gallery-dl; needs
  live confirmation.
- **Chevereto image hosts.** On a Chevereto image page — jpgfish
  (`jpg*.{cr,su,pet,fish,church}`), `imglike.com`, `putmega.com`/`putme.ga` — at
  `/img/<id>` (or `/image/`, `/i/`), the extension now surfaces the full-resolution
  original from the page's `og:image`. Read only when that is a plaintext image URL;
  instances that ship an encrypted `og:image` are skipped, not decrypted (fails
  closed). Referenced from gallery-dl; needs live confirmation.
- **Kemono / Coomer posts.** On a Kemono or Coomer post page
  (`{kemono,coomer}.{cr,su,st,party}/<service>/user/<id>/post/<postId>` — a
  Patreon/Fanbox/etc. mirror) the extension now surfaces the post's files and
  attachments (images, GIFs, and video), read straight from the `<host>/data/…`
  links the page renders (public paths, no token). Scoped to that post's originals —
  the `/thumbnail/` preview server and off-host URLs are skipped — and network-free;
  a post the viewer can't access shows nothing (fails closed). Endpoint/URL shapes
  referenced from gallery-dl; needs live confirmation on a post page.
- **Erome albums.** On an Erome album page (`erome.com/a/<id>`) the extension now
  surfaces every item — each `<div class="media-group">`'s video (`<source>`) or
  lazy-loaded image (`data-src`) — read straight from the page's own CDN URLs
  (`*.erome.com`, host-pinned). Network-free; a private/removed album shows nothing
  (fails closed). Referenced from gallery-dl; needs live confirmation.
- **Image Chest posts.** On an Image Chest post page (`imgchest.com/p/<id>`) the
  extension now surfaces every file's original (`cdn.imgchest.com/files/…`), read
  from the post JSON the page serializes into its `data-page` attribute (images,
  GIFs, mp4). Network-free; a private/empty post shows nothing (fails closed).
  Referenced from gallery-dl; needs live confirmation.
- **TikTok videos & photo posts.** On a TikTok video/photo page
  (`tiktok.com/@<user>/video/<id>` or `/photo/<id>`) the extension now surfaces the clip's
  highest-bitrate mp4 (or one image per photo-mode slide) — read straight from the page's
  own `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON, the URLs TikTok itself signed and shipped
  (passive, never forged, like the Instagram/Facebook readers). Network-free; a private or
  removed video shows nothing (fails closed). The CDN edges are session/hotlink-bound, so
  the download uses the browser's own cookies plus the existing Referer opt-in (#197). (#400)
- **Twitch VODs.** A Twitch VOD (`twitch.tv/videos/<id>`, a link, or a `player.twitch.tv`
  embed) now resolves to its stream: an anonymous access-token call mints the `usher.ttvnw.net`
  HLS master, captured to a single file. Opt-in ("Resolve originals"). Complements the existing
  clip support; sub-only/private VODs simply fail to capture (no circumvention).
- **SoundCloud tracks.** A SoundCloud track page (or a link to one) now resolves to its audio:
  the extension scrapes an anonymous `client_id` from the page, reads the track's transcodings,
  and captures the HLS rendition to an m4a (optionally MP3) — reusing the existing audio-only
  stream path. Opt-in ("Resolve originals"). Private/go+ tracks expose no usable stream → nothing.
- **Patreon post images.** On a Patreon post page (`patreon.com/posts/<slug>-<id>`) the
  extension now surfaces every post image's largest rendition — the un-resized original when the
  page ships it, else the widest — scraped from the hydrated markup (`patreonusercontent.com`)
  and scoped to that post so campaign art / recommended-post media can't leak in. Network-free;
  a paid/locked post the viewer can't access shows nothing (fails closed). Media is token-gated,
  so the download uses the existing Referer opt-in (#197).
- **Pixiv Fanbox post images.** On a Fanbox post page (`<creator>.fanbox.cc/posts/<id>`) the
  extension now surfaces every full-resolution original in the post
  (`downloads.fanbox.cc/images/post/<id>/…`) — the visible thumbnails are lazy/icon-only, but
  the originals are present in the page and read straight from it, scoped to that post so a
  related-post preview can't leak in. Free posts work for anyone; a paid post shows its
  originals only to a viewer who can access it (logged out / not subscribed → nothing, no
  circumvention). `downloads.fanbox.cc` is hotlink-protected, so the download uses the
  existing Referer opt-in (#197). Verified live. (#416)
- **AnimePictures.net full-resolution originals.** On an `anime-pictures.net` post page the
  extension now upgrades the displayed AVIF preview to the true full-size original (e.g. a
  319×600 preview → the 2177×4096 source). The original is the one the page's own download
  button links (`api.anime-pictures.net/pictures/download_image/…`), read straight from the
  DOM — never fabricated — and pinned to the site's domain. That endpoint is **login-gated**:
  a logged-in visitor's session unlocks it (the browser download carries your cookies, like
  clicking the site's download button); logged out it returns nothing, no circumvention.
  Only the main post image is upgraded (related-post thumbnails are left as-is). Verified
  live end-to-end. (#423)
- **Coub videos.** A Coub watch page (`coub.com/view/<permalink>`) now surfaces its loop
  as a ready-to-download video. Coub embeds the full clip object as JSON in the page, and
  the extension reads the combined `share` render — a single mp4 with audio, so no stream
  capture or audio-muxing is needed. Network-free (works with "Resolve originals" off) and
  host-pinned to Coub's CDN. Verified live. (#388)
- **Loom recordings (opt-in network resolver).** With "Resolve originals" enabled, a public
  Loom recording — the share page you're on, an embed, or a link — resolves to its
  downloadable mp4. The extension asks Loom's own (unauthenticated) transcode endpoint for
  the recording's CloudFront-signed `cdn.loom.com` file; recordings with no transcoded mp4
  yet fall back to the raw HLS master to capture. Workspace-restricted looms resolve to
  nothing. Verified live against public shares. (#415)
- **News24 image originals (tier-1 CDN rule).** On `news24cobalt.24.co.za`, photos are
  served at `/resources/<id>/format/<crop>/<file>` where `<crop>` (`smallThumb`,
  `mediumThumb`, `largeThumb`, `inline`, …) is a resized-and-cropped rendition. The
  extension now drops the `/format/<crop>/` segment to reach the full-resolution stored
  original — crop-name-independent and unsigned, so nothing is guessed. A displayed
  `inline` article image (1080×720) resolves to its 4000×2667 original, and a square
  `smallThumb` (176×176) to the full 1875×1875. URLs with no `/format/` segment (an
  already-bare original, or the SVG placeholder) are left untouched. (Corrects an earlier
  read that took the `inline`/og rendition as already-largest — the bare path is ~4× the
  dimensions; curl-verified.) (#395)
- **PeerTube videos (opt-in network resolver).** With "Resolve originals" enabled,
  a PeerTube video — the watch page you're on, a player embed, or a link — surfaces a
  pending video that resolves to the widest downloadable file (or an HLS master to
  capture). PeerTube is federated with no fixed host, so the resolver works on **any**
  instance: it confirms the host really is PeerTube via `/api/v1/config` before fetching,
  reads `/api/v1/videos/<id>` for the largest rendition, and — because a video's media
  can live on the instance, an object-storage subdomain, or another federated instance
  entirely — SSRF-guards both the instance request and every returned media URL rather
  than trusting a fixed host. Public videos only; private / password / internal videos
  resolve to nothing. Verified live against public SFW instances (framatube.org,
  tube.tchncs.de). (#419)
- **Onedio image originals.** On `img-s1/2/3.onedio.com`, each photo is served at
  several widths (`/id-<id>/…/w-300`, `w-600`, `w-900`, `w-1200`) as separate,
  individually **signed** URLs listed in the page's `srcset`. For every image the
  extension now reads that `srcset` and downloads the widest same-`id` rendition
  already offered — a displayed thumbnail resolves to its largest version, and the
  widths collapse to one row keyed on the image id. No fabricated width is ever
  requested (each size is separately signed, so an unlisted width 404s —
  curl-verified 300w 21 KB → 1200w 170 KB). (#391)
- **Der Spiegel image originals.** On `cdn.prod.www.spiegel.de`, each photo is served
  at many widths and crops (`<uuid>_w<width>_r<ratio>_…`) as separate files. For every
  image the extension now reads the page's `srcset` and downloads the **widest**
  rendition offered — a displayed thumbnail resolves to its full-size original, and
  the many widths collapse to one row. No fabricated width is ever requested (Der
  Spiegel's max width is per-image bounded, so a fixed rewrite would 404). (#380)
- **LiveJournal image originals (tier-1 CDN rule).** `ic.pics.livejournal.com` photo
  URLs now swap their size token (`_800`/`_640`/`_100x100`/…) for the FAQ-documented
  `_original` largest — curl-verified `_800` 137 KB → `_original` 593 KB. (#381)
- **Xiaohongshu / RED note images.** RED (`xhscdn.com`) note images are now recognised
  as one family: a note's cover and detail renditions — and the CDN's rotating
  re-signed URLs for the same image — fold to a single download row keyed on the
  image's fileId, the largest displayed rendition (`WB_DFT`) winning, with downloads
  named by the correct extension. Passive and no-auth: the displayed image is already
  RED's best network-free rendition, so this dedups rather than upgrades. Video notes
  are out of scope. Verified live (logged-out and logged-in). rednote.com's
  international CDN (`rednotecdn.com`) is now recognised too — it serves the
  identical signed shape for the same global fileId, so an image opened via
  rednote.com folds to the same row as its `xhscdn.com` counterpart.
- **Two video hosts (opt-in network resolvers).** With "Resolve originals" enabled,
  **Rutube** and **Rumble** watch pages, player embeds, and links now surface a
  pending video that resolves to a capturable HLS master. Rutube reads its public
  `play/options` API (`video_balancer` master, pinned to `rutube.ru`); Rumble derives
  the embed id via its open oEmbed endpoint (the watch HTML is Cloudflare-gated, the
  JSON APIs are not), then reads the `embedJS` HLS master (pinned to the Rumble-CDN
  allowlist). Both public/SFW, no auth; API-returned URLs are host-pinned. All three
  verified live. (PeerTube deferred to a follow-up — its host-agnostic, variable
  media-host model needs dedicated SSRF handling.)
- **Two wallpaper hubs (tier-1 CDN rules).** Passive thumbnail→original path swaps,
  both curl-verified live: **Wallpapers.com** (`/images/thumbnail|high/` → `/images/hd/`,
  the largest segment and the page's `og:image`; extension preserved) and
  **WallpaperAccess** (`/thumb/<id>` → `/full/<id>`, gated to the image path so the
  site's `/download/<slug>` HTML route is never rewritten).
- **Twelve more sweep sites (tier-1 batch 2).** Passive URL→original CDN rules,
  each curl-verified against a real asset: **Shopee** (`img.susercontent.com` —
  strip the `_tn`/`@resize` key suffix), **Mercado Libre** (`mlstatic.com` — size
  code → `-F.jpg`, the full-res JPG), **Tokopedia** (`images.tokopedia.net` — drop
  the `/img/cache/<size>/` segment), **Hepsiburada** (`productimages.hepsiburada.net`
  — size segment → 2000), **Leboncoin** (`img.leboncoin.fr` — `?rule` → `ad-large`),
  **Meesho** (`images.meesho.com` — `?width` → native cap), **Domestika** (unsigned
  imgproxy — drop the processing opts), **Sahibinden** (`shbdn.com` — filename prefix
  → `x5_`), **Wattpad** (`img.wattpad.com` — cover width → 512), **Naver Blog**
  (`postfiles`/`mblogthumb-phinf.pstatic.net` — `?type` → `w3840`, since stripping it
  returns a placeholder), **Lofter** (`lf127.net` — drop the NetEase-NOS query), and
  **nostr.build** (`image.nostr.build` — strip `/thumb/` and `/resp/<size>/`). Catbox
  (`files.catbox.moe`) needs no rule — its URLs are already the raw upload.
- **Fediverse image originals (Pixelfed, Misskey, Lemmy).** One host-agnostic rule
  per network, matched on the media path across any instance (like the existing
  Mastodon rule): **Pixelfed** strips the `_thumb` grid-preview suffix, **Misskey**
  (and Sharkey) unwraps the `/proxy/…?url=` media proxy to the real original, and
  **Lemmy** strips the pict-rs `?thumbnail/?format` resize query (its
  `image_proxy?url=` wrapper was already unwrapped). All verified live on public
  instances.
- **Six more sweep sites (tier-2 batch 2).** **VSCO** (`im.vsco.co` — strip the
  `?w=/dpr` resize query to the master), **Saatchi Art** (`images.saatchiart.com` —
  swap the size token to the largest `-8`), and **WEBTOON** (`pstatic.net` panels —
  strip the `?type=q90` recompress; the panel's `data-url` is now read by the lazy
  collector, and download uses the existing webtoons.com Referer retry) ship as CDN
  rules; **Pikabu** ships as a story-image resolver (fail-closed, community-selector
  based — its pages are anti-bot walled). **Tapas** already worked (its signed panel
  URL is read straight from `data-src`). **Coub** is deferred (its combined mp4 lives
  in page JSON and needs the video-collection path, not a CDN/DOM upgrade).
- **4chan archive support (FoolFuuka).** A resolver for **desuarchive** and
  **4plebs** — reads each post's full media (images + webm) from the
  `thread_image_link`, element-scoped and pinned to the archive's own CDN. Selectors
  come from the FoolFuuka open-source theme (the archives block server-side probes),
  so it fails closed until browser-confirmed.
- **Four new site resolvers (coverage sweep, Tier-2).** Network-free DOM reads,
  each confirmed against a real page: **Postimages** (`postimg.cc` — reads the
  `#download` original, since the displayed image and `og:image` are a downscaled
  render), **4chan** (`boards.4chan.org`/`4channel.org` — reads each post's full
  file, images and webm, keeping the real extension the thumbnail hides;
  element-scoped so every thumb resolves its own post), **4kWallpapers** and
  **WallpapersWide** (pick the largest-area download link — the native resolution
  isn't derivable from the URL). Plus an **ImgBB** CDN rule (`i.ibb.co` — strip the
  `.md`/`.th` size suffix to the original).
- **Nine new site CDN rules (coverage sweep, Tier-1).** Passive URL→original
  upgrades for images on: **Wikimedia Commons** (and every wiki — drop the
  `/thumb/` segment to the upload), **Weibo** (`sinaimg.cn` size alias →
  `large`), **Bilibili** (`hdslb.com`/`biliimg.com` — strip the `@`-transform),
  **Yandex/Dzen** (`avatars.mds.yandex.net` alias → `orig`), **Times of India**
  (`toiimg.com` msid → native width), **Trendyol** (`dsmcdn.com` — strip the
  `mnresize` prefix), **Youm7** (`img.youm7.com` size dir → `large`), **Imgbox**
  (`thumbs<N>` → `images<N>`, `_t` → `_o`), and **Globo** (`glbimg.com` Thumbor
  edge → `0x0` native geometry). Each transform was live-probed for a real
  thumbnail→original byte delta before shipping.
- **Sakugabooru support.** Added `sakugabooru.com` to the booru resolver family.
  Image and settei posts now upgrade the displayed `/data/sample/` downscale to
  the true original behind the "Download larger version" link (often a larger
  format, e.g. a PNG behind a sample JPG). Its videos already downloaded at full
  quality — the post player streams the original `.mp4` directly — so this fills
  in the still-image half of the site.
- **Shopify product-page resolver.** On a Shopify store's product page, collection
  now surfaces the **complete** media set — every variant image **and product
  videos** — by reading the store's public, same-origin `/products/<handle>.js`
  endpoint, covering media the lazy/variant DOM never renders (and videos the
  passive image rule can't reach). Same-origin only (no new permission, no cookies
  sent), auto-detected from the page's Shopify CDN assets, and time-bounded so it
  never blocks collection. Images still upgrade to originals via the existing
  `cdn.shopify.com` rule.
- **Multi-tab batch collection** (#283). Collect media from **all** or
  **selected** open tabs in a single pass and download the combined set from the
  popup's tab picker; each file is tagged with its own source tab (history row,
  download folder, and metadata sidecar).
- **Near-duplicate de-duplication** (#198). An on-demand perceptual-hash (pHash)
  pass hides lower-resolution copies of the same image, keeping the largest.
  Non-destructive and reversible via the **Duplicates** filter, with a
  configurable similarity threshold in Settings.
- **Audio-only MP3 transcode** (#321). Audio-only stream capture can re-encode to
  MP3 at 128 / 192 / 320 kbps instead of the M4A passthrough, selectable in
  Settings and per item.
- **Safari support (in progress).** A native macOS wrapper
  (`apps/safari-native/`, `yarn build:safari`) and the `@mbd/platform` capability
  seam that will back it are in place; the background is not yet routed through the
  seam, so Safari packaging remains under review — see
  [#307](https://github.com/mralaminahamed/media-bulk-downloads/issues/307).
- **Per-site learned deep scan.** The adaptive deep scan now remembers how long
  each site takes to settle and how deep it scrolls, and seeds those on the next
  visit so a repeat scan on the same site starts warm instead of re-learning.
  Local only (nothing is uploaded), on by default, and controlled by a new
  "Remember scan behaviour per site" setting; "Reset this site" clears it.
- **More site resolvers.** Bulk collection recognises and upgrades media from a
  wider set of platforms since 1.2.0, each returning the true original:
  - **Image boards:** the e621 family (e621 / e926 / e6ai), the Gelbooru-0.2
    self-hosts (rule34.xxx / tbib / hypnohub / xbooru / realbooru), the Philomena
    family (derpibooru / furbooru / ponybooru / twibooru), zerochan, and
    **Sankaku Channel** — an opened post's preview/sample tiles fold into their
    md5 original (passive, no auth); grid-only originals resolve via the opt-in
    authenticated action below (#319).
  - **GIF / video / wallpaper:** Giphy, Tenor, imgur `.gifv` → mp4, Burst by Shopify,
    WallpaperCave, wallpaperscraft, plus **Streamable**, **RedGifs**, **Twitch clips**,
    and **9GAG** video (#354). Twitch resolves the highest-quality clip mp4 through one
    Client-ID GraphQL call (its operation/hash are externalized so they can be bumped
    without a release when Twitch rotates them); 9GAG rebuilds a video/GIF post's
    universal mp4 from its id, network-free, and only for posts that actually carry a
    `<video>` (image posts are never touched).
  - **Art:** Pixiv (original master via the logged-in preload) and Newgrounds.

  Passive and network-free where possible; RedGifs downloads clear their hotlink
  403 via the opt-in "Retry w/ referer". **Sankaku** grid-only originals need the
  opt-in **authenticated** resolve (#319) — off by default, it uses your existing
  logged-in session to fetch the signed `file_url`, throttled and host-pinned, and
  stores no credentials; passive browsing never triggers it. No new permissions —
  see [BENCHMARK.md](./docs/BENCHMARK.md).
- **Follow gallery thumbnail links to originals** (#287): an opt-in resolve step
  follows a same-origin thumbnail's link on host / "view" pages to the full image
  (SSRF-guarded).
- **Per-stream rendition picker** (#314): pick the exact HLS/DASH quality per stream
  from the grid or preview, with a live preview of the chosen rendition.
- **Stream capture quality** (#288): a global default — auto / best / worst / 1080 /
  720 / 480 — for which variant capture selects.
- **Audio-only capture** (#204): extract just the audio track (M4A / AAC
  passthrough) from a non-DRM HLS/DASH stream — the basis the MP3 transcode builds on.
- **Copy download command** (#285): when a stream can't be captured in-browser, copy
  a ready-to-run external command (with the page as `Referer`) instead of failing.
- **Per-file metadata sidecar** (#284): optionally write a small JSON sidecar beside
  each download recording its source page and media details.
- **Per-site settings** (#293): collection and filter preferences are remembered per
  host — the Settings dialog gains **Save / Reset for this site** while the editor
  itself stays global.
- **Pinterest video pins & sniffed media** (#308): a passive Pinterest media sniffer
  resolves pins (including video) to their real originals, upgrading each tile in place.

### Changed
- **Smart page defaults are now on by default.** The extension detects the page
  type (gallery, feed, article, single) and primes sensible filter defaults out of
  the box. Nothing is hidden — active defaults show as clearable chips, and the
  behaviour can be turned off in Settings. Existing users who had explicitly toggled
  the setting keep their choice.
- **Smarter filters, dedup, and deep scan** (#291, #292). Filter chips are derived
  from the collected set (stale selections reset automatically); the same image
  served across CDN edges — twimg, imgix, Cloudinary, googleusercontent, WordPress
  Photon — now collapses to a single item; and deep scan adapts its scroll step and
  quiet-window to each page's observed yield instead of using fixed timings.
- **Downloads retry transient failures.** Opt-in resolve fetches and HLS/DASH
  segment fetches now retry transient 429 / 5xx / network blips with bounded
  backoff (honouring `Retry-After`) before giving up.
- **The image-preview modal no longer pops in.** The centred preview dialog now
  appears without its rise-and-scale entrance transform. The side panels and the
  on-page bubble keep their existing entrance.
- **Emoji / UI-glyph exclusion covers many more sources.** With "Exclude emoji" on,
  collection now also skips Slack / Discord / Twitch chat and reaction emoji, the
  Emojipedia, Google Noto and JoyPixels image CDNs, common jsdelivr/cdnjs emoji packs
  (openmoji, noto-emoji, emojione…), and Facebook `rsrc.php` UI sprites — so reaction
  icons and emoji sheets stop showing up as downloadable media. Host- and path-scoped,
  so genuine uploads on shared hosts still collect.
- **Shared links and backups no longer carry signing tokens.** Copying or exporting
  media links, and exporting a settings/favourites/history backup, now strip live
  signed-URL tokens (e.g. Twitch `sig`/`token`, CloudFront `Signature`/`Expires`) from
  the output, so a shared file can't leak a working signed URL. Your on-device copies
  keep the raw URL as the internal re-download key.

### Fixed
- **Extension audit — 10 correctness fixes.** A deep scan / video resolve is no
  longer discarded by a mid-scan settings change; the near-duplicate pass no
  longer aborts when image sizes finish loading; a sole flaky download no longer
  hangs in the queue (and a retry no longer waits on an unrelated download);
  cancelling an item now aborts its transfer and tears down its referer rule; a
  multi-tab item's metadata sidecar records its own source page; the on-page
  bubble's collect + deep scan honour smart-page-defaults, resolve-originals, and
  per-host settings; near-duplicate clustering no longer chains distinct frames
  into one hidden group; and an oversized audio-only capture fails cleanly instead
  of risking an out-of-memory crash.
- **"Can't read this page" in the on-page bubble.** With smart page defaults on by
  default, the bubble surface (which runs inside the page, where `chrome.tabs` is
  unavailable) crashed its scan with "Cannot read properties of undefined (reading
  'query')". Page-type classification now degrades to "unknown" in that context
  instead of throwing.
- **Duplicate files on download (`image.png`, `image (2).png`).** Bulk downloads
  now skip images already saved to disk, and give distinct images that derive the
  same filename clean unique names within a batch (`image.png`, `image-2.png`)
  instead of the browser's " (2)" suffix. Controlled by a new "Skip images already
  downloaded" setting (on by default); re-downloads from Favourites/History always
  go through.
- **YouTube / BBC thumbnail 404s.** YouTube now upgrades only small thumbnails to
  the always-present `hqdefault` (no dead `maxresdefault` links), and BBC targets
  the width `2048` that its `/news/` path actually serves instead of a 404ing `1920`.
- **Security & correctness hardening.** A project-wide audit sweep closed several
  SSRF holes (popup image/convert fetches, the HLS/DASH segment and ZIP fetchers),
  hardened the on-device stores against storage-quota and corrupt values, capped and
  host-pinned the MAIN-world media sniffers, and aligned the download queue with
  Chrome's three-state download model (recovering stuck items and capping retries).
- **Firefox no longer offers features it can't run.** On Firefox the "Capture video
  streams" setting is hidden (stream assembly needs `chrome.offscreen`, which Firefox
  lacks) and the queue's "Retry w/ referer" falls back to a plain retry (Firefox has no
  header-rewrite session rules) — so neither surfaces an action that fails on click.
- **Pinterest board covers & avatars upgrade to full size.** Pinterest's responsive
  `_RS` smart-crop folders (`75x75_RS`, `280x280_RS`, …) for board/section covers and
  avatars now upgrade to the `/originals/` image instead of downloading a tiny square crop.
- **Instagram carousel slides & reels no longer vanish.** A slide or reel whose video
  can't be used yet (still transcoding, or every variant failing the CDN host-pin) but
  that has a valid cover now surfaces that cover — a reel as a pending video, a slide as
  its image — instead of dropping out of the results entirely.
- **Reddit `v.redd.it` share links resolve to video.** A bare `v.redd.it/<id>` link
  (the share form, no trailing slash) is now recognised as a Reddit video instead of
  falling through to the generic image resolver and failing.

## [1.2.0] - 2026-07-11

### Added
- **Many new site resolvers.** Bulk collection now recognises and upgrades media
  from a wide set of new platforms and CDNs, each returning the true original
  (not a thumbnail):
  - **Social / media:** Pinterest (`/originals/` + video pins), Reddit
    (`i.redd.it`/`preview.redd.it` → original, `v.redd.it` video with audio mux),
    Flickr (largest `_k`/`_6k` size), ArtStation (keyless `/4k/` images + video),
    Bluesky (`cdn.bsky.app`, `getBlob`, video HLS), Facebook (Photos/Reels/Page),
    Threads (full-resolution media + mounted video), Mastodon (any instance,
    `/small/` → `/original/`), Dailymotion (HLS via player metadata), and the
    Booru family (Danbooru/Gelbooru/Moebooru originals).
  - **Stock / art / museum / retail:** the IIIF Image API and `images.rawpixel.com`;
    the strip-transform CDN family (Sanity, Storyblok, Uploadcare, ImageKit, Sirv,
    Contentful, Cloudflare Images); The Met, NASA, National Geographic, Nike,
    adidas, and Arc XP sites; and the free-tier stock/icon/wallpaper set
    (Flaticon, pxhere, AlphaCoders, WallpaperFlare).
  - **Site-builder / misc CDN upgrade rules:** Squarespace, Wix, and Bandcamp.

  See [BENCHMARK.md](./docs/BENCHMARK.md) for per-site coverage. All resolvers are
  passive and network-free by default; no new permissions.
- **X / Twitter — recover unpainted media** (#270): photos and videos in status
  cells that the timeline hasn't painted yet are now collected via opt-in
  status-link resolution (max-resolution `name=orig` for images; poster-only
  pending videos are never shown until resolved, so a still frame never leaks).
- **Tabbed settings sheet** (#262): the settings panel is reorganised into tabs
  (Display / Downloads / Media / Data / Advanced) so options are easier to find.
- **Chip-based filter toolbar + Downloaded filter** (#259, #260): the filter row
  is redesigned around type/size chips, and a new **Downloaded / Not-downloaded**
  filter lets you hide media you've already saved (or show only what you haven't).
- **Live download queue** (#257, #273): the queue shows per-file status icons and
  live progress with **Clear / Retry-all / Open** actions, and its panel is now
  **collapsible**. Downloads that hit 100% but never fired a completion event are
  now settled by a progress backstop instead of blocking the queue.
- **Durable storage** (#275): download history, favourites, excluded sources, and
  the download queue are now write-through **mirrored to IndexedDB** (with
  `navigator.storage.persist()`), so Chrome evicting `storage.local` can no longer
  silently wipe them. Existing data is auto-seeded into the mirror on first run.
  Fully on-device; no new permissions.
- **Universal, rotation-proof source exclusion** (#228): excluding a source now
  hides it instantly and stays excluded even when the site rotates the media URL.
- **Save-As prompt hint**: when Chrome's own "Ask where to save each file before
  downloading" setting forces the OS Save-As dialog — which an extension cannot
  read or override — the popup now surfaces a one-time, dismissible hint linking
  straight to `chrome://settings/downloads` so you can turn it off for silent
  saves. Cancelling that dialog no longer makes the download queue re-try (and
  re-prompt); a user-cancelled item is marked failed and left for a manual retry.

- **Facebook original-image accuracy + multi-surface support**: the Facebook
  resolver and its passive MAIN-world sniffer (`fb-media-sniffer`) now cover
  Photos, Reels, and the Page surface with **77–90% original-image accuracy**
  (up from ~5%). Facebook streams its media graph from `/api/graphql` over XHR
  as **`text/html`-content-type, multi-chunk NDJSON** — the shared sniffer
  previously dropped all of it at its json-only content-type and single-parse
  gates. Both gates are now configurable (Facebook opts in; Instagram/X sniffing
  is unchanged), the extractor learned the reel `progressive_url` video key and
  the `/photo(s)/<id>` fbid path, and every candidate is tagged with a
  `mediaKey` so an already-rendered tile upgrades in place once the real
  original streams in, instead of adding a duplicate row. See
  [BENCHMARK.md §G](./docs/benchmark/accuracy.md#g-facebook-original-image-accuracy-passive-sniff--2026-07-10)
  for the full measurement. Passive, read-only; no new permissions.
- **Fixed: "Notify when downloads finish" setting not persisting** (#255):
  toggling the notification setting on requests the optional `notifications`
  permission, and Chrome closes the action popup while that permission prompt
  has focus — which used to drop the unsaved toggle along with the popup, since
  it was only written on the Settings panel's Save button. The toggle is now
  persisted immediately (a direct `SET_SETTINGS` write) the moment it's
  flipped, so enabling it survives the popup closing for the permission prompt.
- **Persistent download queue** (#196): bulk downloads now run through a
  concurrency-capped queue that tracks each file's real outcome
  (queued / downloading / done / failed), retries transient failures with
  exponential backoff, and **resumes after the popup closes or the service
  worker restarts** — a partially-failed batch is no longer indistinguishable
  from a successful one. Success is recorded on the download's actual completion,
  not on dispatch. New **Settings → Downloads → "Simultaneous downloads"**
  (1–10, default 5). The popup shows a live queue with per-file status and
  **pause / resume / cancel / retry**. Fully local; no new permissions.
- **Hotlink 403 fix via Referer rewrite** (#197): many CDNs return **403** to a
  media request whose `Referer` doesn't match the origin site, so hotlink-
  protected downloads used to fail with a confusing error. A failed 403 now
  surfaces a **"Retry w/ referer"** action in the download queue: it retries with
  the item's source page set as `Referer`/`Origin` (via a short-lived, single-URL
  `declarativeNetRequestWithHostAccess` session rule that is torn down immediately after), so
  the same URL returns 200. This **only** rewrites headers for a download you
  initiated and only after an explicit opt-in — it restores access to media you
  can already view, not an auth/paywall bypass.

  **Permission:** requires the **optional** `declarativeNetRequestWithHostAccess` permission,
  requested from the popup the first time you use "Retry w/ referer" — never at
  install, and never for anything else.
- **Metadata preservation for format conversion** (#199): converting an image
  (WebP/AVIF/PNG/JPEG → PNG/JPEG) now copies the source's embedded **EXIF and
  XMP** — copyright, author, capture settings, AI-provenance — into the output
  instead of silently discarding it. The raw metadata segments are copied
  verbatim (no re-parsing) from the source container and re-injected into the
  converted JPEG (APP1) or PNG (`eXIf`/`iTXt`). A new **Settings → Downloads →
  "Metadata when converting"** control offers **Preserve** (default) or
  **Strip** (the previous behaviour, now explicit — for removing GPS/location
  before sharing). If metadata can't be carried across, the original file is
  downloaded untouched rather than a stripped conversion. Fully local; no new
  permissions.

  **Behaviour change:** conversion previously stripped all metadata silently;
  the default is now to preserve it.
- **Magnific** (magnific.com) stock-image resolver: the site serves one photo as
  a responsive `srcset` of five widths (up to 2000px), each carrying its own
  signed, width-bound token — so the same photo otherwise lands as up to five
  duplicate grid items, and the browser only loads a viewport-sized variant
  (often ~1480px). The resolver collapses those variants into a single item at
  the **widest** size the page itself served (2000px here), with a smaller
  variant as its thumbnail and an aspect-correct size for the min-size filter and
  sort. It uses only magnific's own page-issued tokens — it never strips the
  signature (that would drop the image to the 626px `og:image` default), never
  requests a resolution beyond what the site served (the token rejects it), and
  never touches magnific's login or licensed-download flow; licensing and
  attribution under magnific's terms remain the user's responsibility. No new
  permissions.

### Fixed
- **Downloaded mark survives clearing Chrome's download history** (#275): a file
  you already downloaded no longer reverts to "not downloaded" when you clear
  Chrome's own download list — the mark now drops only when the browser
  *positively* reports the file deleted, not when it has simply forgotten the record.
- **Firefox add-on (AMO) validation warnings cleared** (#272): the offscreen
  document is now Chrome-only and the Firefox minimum version was raised for the
  data-collection declaration, so the AMO submission validates cleanly.
- **Facebook UI-icon false positives** (#261): reaction/emoji/control glyphs from
  Facebook's sprite CDN are no longer mistaken for downloadable media.
- **Facebook/Instagram emoji CDN URLs** (#219): emoji served from the FB/IG CDNs
  are excluded from collection.
- **On-page bubble menu** (#236): fixed a Shadow-DOM menu bug and improved the
  bubble's accessibility.
- **Security hardening**: closed a Behance host-bypass in a resolver (#230) and
  hardened the HLS/DASH segment fetchers against SSRF (#235); plus 25 correctness
  fixes from two code audits (#229, #230).
- **HLS/DASH streams in bulk downloads** (#210): streaming videos are now captured
  correctly when part of a bulk download, and a Cloudinary folder-path 404 was fixed.
- **No more duplicate grid tiles + reliable settings** (#218): a canonical
  source-key system dedupes the same media served under multiple URLs/renditions
  so it appears once, and settings now persist reliably through a unified dispatch
  router.

### Changed
- **Test runner migrated from Jest to Vitest** (#233) — contributor-facing.
- **Tailwind utilities namespaced under the `mbd:` prefix** (#276) —
  contributor-facing; no visual change.
- **Internal restructuring**: the background service worker and the popup were
  split into focused modules/hooks (#251, #252, #253, #271) with no behaviour change.

## [1.1.0] - 2026-07-07

### Added
- **Vimeo videos**: a Vimeo embed (`player.vimeo.com/video/…`) or a `vimeo.com`
  link is surfaced as a video and, on the opt-in **Get video** / resolve pass,
  fetched as a direct **progressive MP4** (highest available) read from Vimeo's
  own public player config — Vimeo hides the file behind that config, so the
  generic HLS sniffer can't see it. Domain-locked / privacy videos (whose config
  returns 403) and renditions with no progressive MP4 are left unresolved; the
  URL is host-pinned to `vimeocdn.com`. No new permissions.
- **HLS stream capture** (VOD): a `.m3u8` stream found on a page — a native
  `<video src=…m3u8>`, a `<source>`, an `og:video`, or a direct link — is now
  surfaced as a **capturable** item. **Capture** fetches the manifest and every
  segment, decrypts standard **AES-128** as needed, and assembles them into one
  file (MPEG-TS `.ts`, or `.mp4` for fragmented-MP4 streams) — no external tools.
  It picks the ~720p variant by default and runs in the popup (so keep it open,
  like the ZIP flow). **DRM** (Widevine/PlayReady/FairPlay, SAMPLE-AES) and
  **live** streams are refused — capturing them would breach the stream's DRM and
  the Chrome Web Store policy. Streams over the in-popup size cap report a clear
  message. No new permissions. Streams are found both in the page DOM and — via
  a passive, MAIN-world network sniffer — from `hls.js` / native players that
  fetch the `.m3u8` over XHR (so it never appears in the DOM); the sniffer only
  reads request URLs, never bodies. Unbounded-size capture and capture without
  the popup open (via an offscreen document) are planned follow-ups.
- **YouTube poster resolver**: a dedicated, policy-compliant resolver that turns
  any YouTube video reference — an embedded player `<iframe>` (including
  privacy-enhanced `youtube-nocookie` and lazy `data-src` embeds), or a link in
  `watch` / `youtu.be` / `/embed` / `/shorts` / `/live` / `/v` form — into that
  video's **public poster thumbnail** (`i.ytimg.com/.../hqdefault.jpg`), even when
  no `<img>` for it exists on the page. It emits the largest variant *guaranteed*
  to exist (`hqdefault`, 480×360); collection is network-free so higher variants
  (`maxres`/`sd`) that 404 for many videos are never synthesized. Video/audio
  **streams are intentionally not touched** — YouTube delivers them as ciphered
  DASH/HLS and downloading them breaks the YouTube ToS and Chrome Web Store
  policy; only the openly-embeddable poster image is collected. No new permissions.
- **`og:video` collection**: direct downloadable `.mp4`s exposed only in
  `<meta property="og:video">` (common on news, product, and embed pages) are now
  collected, with the `og:image` as their poster. Streaming manifests
  (`.m3u8` / `.mpd`) are still skipped — they aren't a single downloadable file.
- **Image format conversion**: an opt-in **Settings → Downloads** option to
  re-encode raster images (incl. WebP/AVIF) to **PNG** or **JPEG** as they
  download, via an in-page canvas. Videos, audio, SVGs, GIFs, and images already
  in the target format are saved as-is; anything that can't be decoded falls back
  to its original. A progress bar shows the conversion. No new permissions.
- **Progress bar** for in-extension batch work the browser's download shelf can't
  show: a determinate bar with a live count while a **ZIP** is being fetched, and
  an indeterminate bar while **resolving videos** ("Get all videos").
- **Download-complete notifications**: an opt-in desktop toast reporting the
  result of each download batch — the only feedback when you download from a
  keyboard shortcut or the right-click menu (no popup open). Enable under
  **Settings → Downloads**; it requests the optional `notifications` permission
  the first time, so nothing is prompted at install.
- **Keyboard shortcuts**: open the popup (`Ctrl/⌘+Shift+M`) or download all media
  on the current page (`Ctrl/⌘+Shift+Y`) without touching the mouse. Rebind or
  disable them at `chrome://extensions/shortcuts`. (No new permission — `commands`
  is a manifest key.)
- **Copy / export links & data backup**: the download button's menu can now
  **copy** the shown/selected media URLs to the clipboard or **export** them as a
  `.txt`. A new **Settings → Backup** section exports your settings, favourites,
  and history to a JSON file and imports them back (import replaces favourites and
  history). No new permissions; everything stays on your device.
- **Right-click menu**: **Download all media on this page** from anywhere, plus
  **Download image (original quality)** and **Add image to Favourites** when
  right-clicking an image (and **Download this media** on a video/audio element)
  — no need to open the popup. Single-image downloads are upgraded to their
  original via the CDN rules. Adds the `contextMenus` permission.
- **Grid search & sort**: a search box (matched against filename, alt text, type,
  and URL) plus a sort control (by name, size, dimensions, or type, ascending or
  descending) above the filter row — makes big result sets navigable. Items with
  an unknown size/dimension sort last so the "largest/smallest" views stay clean.
- **Download as ZIP**: bundle the shown or selected media into a single ZIP
  archive from the download button's caret menu, instead of many separate files.
  Items are stored under the same `{host}/{domain}/{date}/{kind}` folder layout
  inside the archive, so unzipping reproduces your configured structure. Any item
  a CDN blocks (hotlink `403` / offline) falls back to an individual download
  automatically. Archives are built in-page and never leave your device.
- **Instagram** dedicated resolver + passive MAIN-world network sniffer: posts,
  reels, and carousels resolve to full-resolution images and their real
  downloadable `.mp4`s from the page's own JSON/GraphQL responses (no forged
  URLs). Reels shown before their video is seen are labelled **"play to fetch"**
  and upgrade to the real clip once played.
- **X/Twitter** video sniffer: captures the page's own progressive-mp4 responses
  so posted videos download as real files (covers age-restricted clips).
- **Selective bulk download**: tick individual items (with shift-click ranges and
  select-all-shown) and download just the chosen set.
- **Configurable deep scan**: item / time / scroll-step caps, an opt-in
  **"Load more"** button-clicking pass, nested-scroller stepping, and a notice
  when a scan stops at a cap (media may remain). Configure under **Settings → Deep scan**.
- **Broader collection**: open Shadow DOM (web components), same-origin
  `<iframe>`s, `og:image` / `twitter:image` / `<link rel=preload>` hero images,
  WordPress `data-orig-file` / `data-large-file` originals, and `image-set()` CSS
  backgrounds.
- Download-path templates: the **Save to subfolder** setting now accepts
  `{host}`, `{domain}`, `{date}`, and `{kind}` tokens, so downloads can be
  organized into per-site (and per-day / per-kind) folders automatically — e.g.
  `Media/{domain}` saves each site to its own folder. A template with no tokens
  behaves exactly as the old static subfolder did. See
  [docs/guides/download-paths.md](docs/guides/download-paths.md).
- Favourites: star any image, video, or audio item to a personal **Favourites**
  list that persists across pages and sessions. Star from the grid tile or the
  preview; a filled-star badge marks saved items. A new Favourites panel lists
  them with **Download**, **Open source**, and **Remove** (plus **Clear all**),
  and re-downloads through the normal flow (so download-path tokens still apply).
  Stored locally, capped at 500. See [docs/guides/favourites.md](docs/guides/favourites.md).

### Changed
- Media collection now walks each DOM root **once** instead of eight times — the
  `<img>`/`<picture>`/`<video>`/`<audio>`/`<a>`/`<noscript>`/`<iframe>` passes are
  bucketed during the single element walk the background-image scan already does.
  Same results; less work per scan, which matters most during deep scan (it
  re-scans a growing DOM every scroll round).
- Unified the in-app brand mark with the installed toolbar icon. The popup
  header and the on-page bubble launcher now render the actual icon artwork
  from a single shared `BrandMark` component (per-instance gradient IDs), so
  they can no longer drift from the icon users see in the browser — replacing
  the old, mismatched line glyph.

### Fixed
- Deep scan's opt-in "Load more" pass no longer clicks `<a role="button">`
  controls that would navigate away and abort the scan.
- WordPress `data-orig-file` / `data-large-file` originals are no longer tagged
  with the on-screen thumbnail's dimensions, so the minimum-size filter can't
  wrongly drop a genuinely large image.
- The X video sniffer now keeps the most recent clips (evicting the oldest at its
  cap) and can update a media id with a better variant, instead of freezing on the
  first ones seen.
- Saving settings from the popup no longer clobbers the on-page bubble's dragged
  position/placement (read-modify-write merge).
- Enriched image byte-sizes survive a settings change instead of resetting and
  re-firing a burst of HEAD requests.
- Base64 and URL-encoded inline SVGs now match the `svg` image-type filter.
- CSS `image-set()` candidates written without a resolution descriptor are kept
  (default 1×) instead of being dropped.
- Download history and favourites are bounded by serialized size, so large
  base64 `data:` entries can't silently exceed the browser storage quota.
- A deep scan that throws mid-run returns the media gathered so far (with an
  error notice) instead of an empty result.

## [1.0.0] - 2026-07-04

Initial public release.

### Added
- Collect images, video, and audio from any page — including lazy `data-*`
  attributes, `srcset`, `<picture>`, CSS backgrounds, `<noscript>`, gallery
  links, and `<video>`/`<audio>` sources.
- Original-quality upgrades: de-proxying wrapped URLs and rewriting CDN
  thumbnails to full size, with an opt-in network resolver for exact originals.
- Deep scan: bounded auto-scroll to surface virtualized / infinite-scroll media.
- Filter by kind, format, and size; download one item or the whole filtered set
  with kind-correct extensions, a configurable subfolder, and naming options.
- Download history with per-entry **Open source**, **Open file**, and **Show in
  folder** actions (`downloads.open` permission).
- Optional on-page bubble in an isolated Shadow DOM, with a theme-aware page dim
  behind the open panel (visual only) so it reads clearly on light pages.
- **Cross-browser builds** via [WXT](https://wxt.dev): Chrome, Firefox (MV3,
  109+), and Edge packages and store-ready zips from one codebase (`yarn zip:all`).
- Network-free by default; settings and download history stored locally.
- Chrome Web Store submission package (`docs/store-submissions/CHROME_WEBSTORE.md`), privacy policy
  (`PRIVACY.md`), and community health files (contributing guide, security
  policy, code of conduct, issue/PR templates).

### Design & quality
- Solid indigo brand icon (photo glyph + download arrow), legible down to 16px.
- Popup UX: theme-correct modal/thumbnail scrims and control rings for dark mode,
  WCAG-AA data contrast, unified modal accessibility (focus trap, Escape, dialog
  roles) via a shared `useDialog` hook, tokenized radii/icon/button scales, and
  Tailwind v4 CSS-variable utilities.
- Settings validation: field helpers, dirty-gated Save, Escape-to-close, number
  clamping, and hiding the file-name prefix in Original naming mode.

### Fixed
- Twitter/X GIF thumbnails served without a path extension are collected as
  downloadable video instead of leaking as a still image.

[Unreleased]: https://github.com/mralaminahamed/media-bulk-downloads/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/mralaminahamed/media-bulk-downloads/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mralaminahamed/media-bulk-downloads/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mralaminahamed/media-bulk-downloads/releases/tag/v1.0.0
