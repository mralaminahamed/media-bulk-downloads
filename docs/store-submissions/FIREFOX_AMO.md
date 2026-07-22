# Firefox Add-ons (AMO) — Submission Package

Everything needed to publish **Media Bulk Downloads** to
[addons.mozilla.org](https://addons.mozilla.org/developers/): copy-paste listing
fields, permission notes, the privacy disclosures, required assets, and — the
part unique to Firefox — the **source-code submission and reproducible build
instructions** reviewers require.

Version at time of writing: **1.3.0** · Manifest **V3** (Firefox 140+). This is
the Firefox sibling of [CHROME_WEBSTORE.md](./CHROME_WEBSTORE.md) and
[EDGE_ADDONS.md](./EDGE_ADDONS.md); the listing copy is intentionally identical
so all three stores match.

> **Live listing:** https://addons.mozilla.org/en-US/firefox/addon/media-bulk-downloads/

> **Different from Chrome / Edge — don't miss these:**
> - AMO is **free**; you sign in with a Firefox account.
> - The add-on **ID is mandatory** and already baked into the manifest
    > (`browser_specific_settings.gecko.id` = `media-bulk-downloads@mralaminahamed`).
> - **Source code submission is mandatory** — the package is bundled/transpiled,
    > so you must upload the `…-sources.zip` *and* give reviewers reproducible
    > build steps (§7). This is the one thing Chrome/Edge don't ask for.
> - The manifest already declares **no data collection**
    > (`data_collection_permissions: { required: ['none'] }`).
> - Minimum supported Firefox is **140.0** (`strict_min_version`; Android **142.0**).

---

## 1. Pre-submission checklist

- [ ] **Firefox account** created and the AMO developer agreement accepted at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
- [ ] `wxt.config.ts` sets the Firefox `gecko.id`, `strict_min_version: '140.0'`, and `data_collection_permissions: { required: ['none'] }`. `yarn build:firefox` emits
  `apps/extension/.output/firefox-mv3/manifest.json`.
- [ ] Permissions match what ships: `downloads`, `downloads.open`, `storage`, `tabs`, `contextMenus`, host `<all_urls>`; optional `notifications` and `declarativeNetRequestWithHostAccess` (both
  requested at runtime). Note: `offscreen` is **Chrome-only** — `wxt.config.ts` omits it from the Firefox build (Firefox has no `chrome.offscreen`, and AMO rejects the permission), so HLS/DASH stream
  capture is not available on Firefox.
- [ ] Icons 16/32/48/64/128 present (`apps/extension/src/public/icon/`) — ✅ already in the build; AMO uses the manifest icons (no separate store logo).
- [ ] `yarn lint` and `wxt build -b firefox` pass clean (AMO runs its own validator on upload too).
- [ ] Privacy policy hosted at a public URL (see §6): `https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md`.
- [ ] At least **1 screenshot** (see §5).
- [ ] `apps/extension/.output/media-bulk-downloads-<version>-firefox.zip` **and** `…-firefox-sources.zip` produced by `yarn zip:firefox`.
- [ ] Reviewer **build instructions** ready to paste (§7).

---

## 2. Store listing fields

**Name** (≤ 50 chars)

```
Media Bulk Downloads
```

**Summary** (≤ 250 chars) — reuse the manifest description:

```
Bulk-download images, video & audio from any web page. Smart type filters, instant preview, original quality — fast and private.
```

**Categories** (pick up to 2): **Download Management** (primary) · **Photos, Music & Videos**

**License** (for the listing / source): **MIT** (matches the repository `LICENSE`).

**Tags:** `download`, `images`, `video`, `audio`, `bulk`, `gallery`

**Homepage / Support site:** `https://github.com/mralaminahamed/media-bulk-downloads`
**Support email:** `alamin.ahamed.dev@gmail.com`

**Description** (paste into the listing):

```
Media Bulk Downloads finds every image, video, and audio file on the page you're
viewing and lets you preview, filter, and download them in bulk — quickly, and
without sending your browsing anywhere.

FINDS MORE THAN "save image as"
• Lazy-loaded images (data-* attributes), srcset, <picture>, and CSS backgrounds
• Gallery links, <noscript> fallbacks, and <video>/<audio> sources
• Deep scan: an optional, bounded auto-scroll that surfaces media on infinite-
  scroll and virtualized pages

ORIGINAL QUALITY
• De-proxies wrapped URLs and rewrites CDN thumbnails to full size
• Optional "resolve originals" fetches the exact highest-resolution file for
  supported hosts (off by default)

FILTER, SEARCH, AND DOWNLOAD
• Filter by kind (image / video / audio), format, and size; search by name/alt/URL
• Sort by name, size, dimensions, or type
• Tick individual items (with shift-click ranges and select-all) for a partial set
• Download one item or the whole set, with correct file extensions
• Bundle the selection into a single ZIP, or copy/export the media URLs as .txt
• Organize into per-site / per-day / per-kind folders with {host}/{domain}/{date}/{kind} path tokens
• A download history with one-click re-download, open file, or reveal in folder
• Favourites: star images, video, or audio to a list that persists across pages

WORKS ON THE SITES YOU USE
• Original-quality resolvers for X/Twitter, Instagram, Facebook, Threads,
  Bluesky, Mastodon, Pinterest, Reddit, Flickr, ArtStation, Behance, Unsplash,
  and Wallhaven
• Video from Vimeo, Dailymotion, YouTube poster frames, and the Booru art sites
• Museum, stock & CDN coverage: the IIIF Image API, rawpixel, and image CDNs such
  as Cloudinary, Sanity, Uploadcare, ImageKit, Contentful, and Cloudflare — plus
  50+ more families
• Optional WebP/AVIF → PNG/JPEG conversion that preserves EXIF/XMP metadata

RELIABLE DOWNLOADS
• A resilient download queue tracks each file (queued / downloading / done /
  failed), retries transient failures, and resumes after the popup closes — with
  pause, resume, cancel, retry, and a "simultaneous downloads" cap
• "Retry with page referer" recovers hotlink-protected files that return 403
• Filter by Downloaded / Not-downloaded, and exclude sources you never want to see

FASTER TO REACH
• Keyboard shortcuts: open the popup, or download all media on the page
• Right-click menu: download all page media, or a single image at original quality
• Optional desktop notification when a download batch finishes
• Back up and restore your settings, favourites, and history as a JSON file

PRIVATE BY DESIGN
• Network-free by default: it only reads what the page already loaded
• No accounts, no analytics, no servers — everything runs locally in your browser
• Your settings and history never leave your device

An optional on-page bubble gives you the same tools in a draggable panel without
opening the toolbar popup.
```

---

## 3. Add-on identity & compatibility

| Field           | Value                                                                                                                       | Set in                                 |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------------|
| Add-on ID       | `media-bulk-downloads@mralaminahamed`                                                                                       | `browser_specific_settings.gecko.id`   |
| Minimum Firefox | `140.0` (desktop) · `142.0` (Android)                                                                                       | `strict_min_version`                   |
| Background      | MV3 **event page** (`background.scripts: ["background.js"]`) — WXT converts the service worker to Firefox's event-page form | WXT build                              |
| Data collection | `none` (declared)                                                                                                           | `data_collection_permissions.required` |

The ID is permanent — never change it, or AMO treats future uploads as a
different add-on and existing users won't get updates.

---

## 4. Permissions (Notes to reviewer)

Firefox shows users the permission prompt automatically; add these to the
**Notes to reviewer** so the human reviewer can map each permission to a use.

**downloads / downloads.open** — save the images/video/audio the user selects
through the browser's download manager, and reopen a previously downloaded file
from the in-extension history. This is the core action.

**storage** — stores the user's own preferences (`browser.storage.sync`) and
their local download history (`browser.storage.local`) on their device. No
content is transmitted.

**tabs** — reads the active tab's URL and title to (1) label each download with
the page it came from, and (2) open a media item's source page in a new tab when
the user asks. No browsing history is collected or sent.

**contextMenus** — adds right-click menu items ("Download all media on this
page"; on an image/video/audio element, "Download this media", "Download image
(original quality)", "Add image to Favourites") so the user can act without
opening the popup. Each triggers the same local download the popup performs.

> **No `offscreen` on Firefox.** The Chrome/Edge builds use an `offscreen`
> document to capture HLS/DASH streams; Firefox has no `chrome.offscreen`, so
> `wxt.config.ts` omits the permission from the Firefox build and that feature is
> unavailable here. There is no `offscreen` justification to provide for AMO.

**Host permissions — `<all_urls>`** — the extension must read the media elements
on whatever page the user runs it on, which can be any site. It activates only
when the user opens the popup or enables the on-page panel. Small content scripts
read the page's media; on a few sites (e.g. Instagram, X/Twitter, Facebook,
Pinterest, MangaDex) a passive script observes the page's own media network
responses so posted images/videos resolve to real downloadable files — it reads
only the request URLs/JSON the page itself already loaded and never sends them
off-device. When the optional "resolve originals" setting is on, it also fetches a
higher-resolution version of a downloaded item directly from that media's own CDN.
It does not read or transmit page content for any other purpose.

> **Content scripts.** Beyond the `<all_urls>` page collector (ISOLATED world),
> the Firefox build injects six MAIN-world media sniffers: one host-agnostic
> `.m3u8`/`.mpd` manifest sniffer (`<all_urls>`) and five host-scoped to
> `instagram.com`, `x.com` + `twitter.com`, `facebook.com`, `pinterest.com`, and
> `mangadex.org`. Each reads only the request URLs/JSON the page itself already
> loaded and sends nothing off-device. Firefox 128+ supports MAIN-world content
> scripts; these are manifest keys, not extra permissions, and are covered by the
> `<all_urls>` justification above. (Stream *capture* itself is unavailable on
> Firefox — see the `offscreen` note above — but the manifest sniffer still runs.)

**notifications (optional)** — off until the user enables it. Shows a desktop
notification with the result of a download batch — the only feedback when the
user downloads via a keyboard shortcut or the right-click menu with no popup
open. Requested at runtime the first time it is enabled, never at install.

**declarativeNetRequestWithHostAccess (optional)** — off until the user enables it. Fixes
hotlink-protected downloads: some CDNs reject a file request whose Referer header
doesn't match the page it is shown on (HTTP 403). When a download the user
started fails that way, the extension can retry it with a temporary, single-URL
session rule that sets Referer/Origin to that item's own source page, then removes
the rule right after. Requested at runtime the first time the user chooses "Retry
with page referer" on a failed download, never at install. It only modifies
headers on a request the user initiated and restores access to media the user can
already view — not an auth or paywall bypass.

---

## 5. Required visual assets

AMO uses the **manifest icons** (no separate store logo). Add screenshots to make
the listing land. The seven real 1280×800 captures in `assets/v2/` from the
Chrome/Edge packages are reused here as-is; AMO lets you add a **caption** per
screenshot, so paste the ones below. AMO accepts up to 10 — all seven fit.

| Asset        | Size     | Required           | File / caption                                                                                                                          |
|--------------|----------|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Add-on icon  | 128×128  | ✅ (from manifest)  | `apps/extension/src/public/icon/128.png`                                                                                                               |
| Screenshot 1 | 1280×800 | ✅ (≥1 recommended) | `assets/v2/screenshot-1-grab-1280x800.png` — **Every image, video, and audio file on the page — in one grid, ready to download.**       |
| Screenshot 2 | 1280×800 | optional           | `assets/v2/screenshot-2-preview-1280x800.png` — **Preview any item full-size with its dimensions, type, and source.**                   |
| Screenshot 3 | 1280×800 | optional           | `assets/v2/screenshot-3-settings-1280x800.png` — **Sort downloads into folders with path tokens, naming rules, and format conversion.** |
| Screenshot 4 | 1280×800 | optional           | `assets/v2/screenshot-4-filters-1280x800.png` — **Filter by format and size, search by name, and sort — narrow a busy page fast.**      |
| Screenshot 5 | 1280×800 | optional           | `assets/v2/screenshot-5-favourites-1280x800.png` — **Star media to Favourites that stays with you across pages.**                       |
| Screenshot 6 | 1280×800 | optional           | `assets/v2/screenshot-6-excluded-1280x800.png` — **Block sources you never want to see with the Excluded-sources list.**                |
| Screenshot 7 | 1280×800 | optional           | `assets/v2/screenshot-7-history-1280x800.png` — **Re-download, open, or reveal anything from your download history.**                   |

PNG or JPEG, 1280×800. Order 1→7 tells the story: find → preview → organize →
filter → favourite → exclude → history.

---

## 6. Privacy & data disclosures

**Privacy policy URL:**

```
https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md
```

(The repository is public, so this resolves for reviewers. Keep it current by
editing `PRIVACY.md` on `main`.)

**Data collection:** none. The manifest declares
`data_collection_permissions: { required: ['none'] }`, and in the AMO listing's
data-collection section select **"This add-on does not collect any data."**
Settings and history stay on the device; nothing is transmitted.

**Remote code:** No. All code is bundled in the package; nothing is fetched and
executed at runtime. (AMO rejects add-ons that run remote code — make sure this
answer stays "No".)

---

## 7. Source code & reviewer build instructions (mandatory)

AMO requires the **source code** for any add-on whose submitted files are
bundled, minified, or transpiled — which this one is (WXT + TypeScript + a
bundler). When prompted during submission, upload the sources archive and paste
the build steps so a reviewer can reproduce the exact package.

**Upload:** `apps/extension/.output/media-bulk-downloads-<version>-firefox-sources.zip`
(produced alongside the package by `yarn zip:firefox`).

**Build instructions to paste (reviewer reproduces the package):**

```
Build environment
- OS: macOS, Linux, or Windows
- Node.js 22 (see .nvmrc)
- Yarn 4.17.1 via Corepack (pinned in package.json "packageManager")

Steps
1. corepack enable
2. corepack yarn install --immutable
3. corepack yarn zip:firefox

Output
- Package:  apps/extension/.output/media-bulk-downloads-<version>-firefox.zip
- Sources:  apps/extension/.output/media-bulk-downloads-<version>-firefox-sources.zip
The unpacked build is apps/extension/.output/firefox-mv3/ ; its manifest.json matches the
submitted package. Built with WXT (wxt.dev); no other tooling required.
```

**Notes to reviewer (how to test):**

```
No account, sign-in, or server is required — everything runs locally. Open any
image-heavy page (e.g. a Wikimedia Commons category or a news article), click the
toolbar icon, and the popup lists every image, video, and audio file found. Use
the filter bar (kind / format / size), click a tile to preview, and Download to
save one item or the whole filtered set. Optional extras: the on-page bubble
(enable in Settings), Deep scan (a bounded auto-scroll button), and "Resolve
exact originals" (OFF by default — the only setting that contacts a host other
than the current page, using the id already visible in the page URL).
```

---

## 8. Build & upload

WXT packages a store-ready zip per browser (Firefox also emits the sources zip):

```bash
corepack yarn zip:firefox  # firefox → …-firefox.zip  +  …-firefox-sources.zip
corepack yarn zip          # chrome  → …-chrome.zip
corepack yarn zip:edge     # edge    → …-edge.zip
corepack yarn zip:all      # all of the above
```

Version comes from `apps/extension/package.json` (WXT writes it into every manifest).

**Firefox Add-ons (AMO):**

1. [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) → **Submit a New Add-on**.
2. Choose **On this site** (listed, public).
3. Upload `…-firefox.zip`. When the validator asks, upload `…-firefox-sources.zip` and paste the build instructions (§7).
4. Fill the listing (§2), screenshots (§5), privacy policy + data-collection answers (§6), and Notes to reviewer (§4 + §7).
5. Submit. The add-on goes through automated validation and (for listed add-ons) human review.

**To ship an update:** bump `version` in `package.json`, re-run `yarn zip:all`,
upload the new `…-firefox.zip` (+ the fresh `…-firefox-sources.zip`), and resubmit.
Keep the `gecko.id` unchanged so existing users get the update. One version bump
keeps every manifest in sync across Chrome, Edge, and Firefox.
