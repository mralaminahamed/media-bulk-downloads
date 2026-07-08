# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

[Unreleased]: https://github.com/mralaminahamed/media-bulk-downloads/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mralaminahamed/media-bulk-downloads/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mralaminahamed/media-bulk-downloads/releases/tag/v1.0.0
