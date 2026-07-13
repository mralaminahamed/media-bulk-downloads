# Chrome Web Store — Submission Package

Everything needed to publish **Media Bulk Downloads** to the Chrome Web Store:
copy-paste listing fields, per-permission justifications, the privacy
disclosures, required visual assets, and the packaging steps.

Version at time of writing: **1.2.0** · Manifest **V3**.

> **Live listing:** https://chromewebstore.google.com/detail/media-bulk-downloads/jmdhkdengijmmkelofaleinbipophckn

---

## 1. Pre-submission checklist

- [ ] One-time **$5 developer registration** paid on the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] `wxt.config.ts` name/description correct; version comes from `package.json`. `yarn build` emits `.output/chrome-mv3/manifest.json`.
- [ ] Permissions match what ships: `downloads`, `downloads.open`, `storage`, `tabs`, `contextMenus`, `offscreen`, host `<all_urls>`.
- [ ] `minimum_chrome_version: 109` is set in the Chrome/Edge manifest (the `chrome.offscreen` floor for HLS/DASH capture); the Firefox manifest omits it and pins `gecko.strict_min_version` instead.
- [ ] Optional permissions declared: `notifications` and `declarativeNetRequestWithHostAccess` (both requested at runtime, not at install — see §4).
- [ ] `commands` (keyboard shortcuts) and the MAIN-world content scripts (page + Instagram/X media sniffers) are present — no extra permission needed, but note them for review (see §4).
- [ ] Icons 16/32/48/64/128 present (`src/public/icon/`) — ✅ already in the build.
- [ ] Privacy policy hosted at a public URL (see §6): `https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md`.
- [ ] At least **1 screenshot** at 1280×800 or 640×400 (see §5) — ✅ seven real captures in `assets/v2/` (`screenshot-1-grab` … `screenshot-7-history`); Chrome shows up to 5.
- [ ] Promo tiles (optional): small 440×280 + marquee 1400×560 — ✅ in `assets/v2/` (`promo-small-440x280.png`, `promo-marquee-1400x560.png`).
- [ ] `.output/media-bulk-downloads-<version>-chrome.zip` produced by `yarn zip`.
- [ ] Single-purpose description, permission justifications, and data disclosures filled in (below).

> **Updating the existing listing (1.2.0 over the live 1.1.0):** 1.2.0 adds the
> optional `declarativeNetRequestWithHostAccess` permission (the hotlink-403 Referer
> retry) on top of the 1.1.0 permission set (`contextMenus`, `offscreen`, optional
> `notifications`). Added permissions trigger a fuller re-review; the optional ones
> are requested at runtime, so they don't re-prompt existing users on update — fill
> a justification for each new permission (§4) before submitting.

---

## 2. Store listing fields

**Name** (≤ 75 chars)

```
Media Bulk Downloads
```

**Summary / short description** (≤ 132 chars) — reuse the manifest description:

```
Bulk-download images, video & audio from any web page. Smart type filters, instant preview, original quality — fast and private.
```

**Category:** Productivity

**Language:** English

**Detailed description** (paste into the listing):

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
• Capture standard HLS (.m3u8) and DASH (.mpd) video streams to a single file
  (no DRM, no live)
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

## 3. Single-purpose description (required)

```
Media Bulk Downloads finds the images, video, and audio on the web page the user
is viewing and lets them preview, filter, and download those files in bulk.
```

---

## 4. Permission justifications (required — one per permission)

**downloads**

```
Saves the images, video, and audio the user selects to their computer through
Chrome's download manager. This is the extension's core action.
```

**downloads.open**

```
Lets the user open a file they previously downloaded through the extension,
directly from the in-extension download history.
```

**storage**

```
Stores the user's own preferences (chrome.storage.sync) and their local download
history (chrome.storage.local) on their device. No content is transmitted.
```

**tabs**

```
Reads the active tab's URL and title to (1) label each download with the page it
came from in the history, and (2) open a media item's source page in a new tab
when the user asks. No browsing history is collected or sent.
```

**contextMenus**

```
Adds right-click menu items — "Download all media on this page", and, on an
image/video/audio element, "Download this media", "Download image (original
quality)", and "Add image to Favourites" — so the user can act without opening
the popup. The items only trigger the same local download the popup performs.
```

**offscreen**

```
Runs an offscreen document to carry out media assembly that the short-lived
service worker and the popup cannot hold open on their own — such as capturing a
standard HLS (.m3u8) video stream by fetching and joining its segments — entirely
on the user's device. No page content is transmitted.
```

**notifications (optional)**

```
Optional, off until the user turns it on. Shows a desktop notification reporting
the result of a download batch — the only feedback available when the user
downloads via a keyboard shortcut or the right-click menu with no popup open. It
is requested at runtime the first time it is enabled, never at install.
```

**declarativeNetRequestWithHostAccess (optional)**

```
Optional, off until the user turns it on. Fixes hotlink-protected downloads: some
CDNs reject a file request whose Referer header doesn't match the page it is shown
on (HTTP 403). When a download the user started fails that way, the extension can
retry it with a temporary, single-URL session rule that sets Referer/Origin to
that item's own source page, then removes the rule immediately after the retry.
It is requested at runtime the first time the user chooses "Retry with page
referer" on a failed download, never at install. It only ever modifies headers on
a request the user initiated, and restores access to media the user can already
view — it is not an auth or paywall bypass.
```

**Host permissions — `<all_urls>`**

```
The extension must read the media elements on whatever page the user runs it on,
which can be any site. It activates only when the user opens the popup or enables
the on-page panel. Small content scripts read the page's media; on a few sites
(e.g. Instagram, X/Twitter, Facebook, Pinterest) a passive script observes the page's own media
network responses so posted images/videos resolve to real downloadable files —
it reads only the request URLs/JSON the page itself already loaded and never
sends them off-device. When the optional "resolve originals" setting is on, or
when capturing an HLS stream, it fetches the higher-resolution file or the
stream's segments directly from that media's own CDN. It does not read or
transmit page content for any other purpose.
```

> **Content scripts / `commands`:** the manifest also declares keyboard shortcuts
> (`commands`) and five content scripts — a page collector plus MAIN-world media
> sniffers scoped to `instagram.com`, `x.com`, `twitter.com`, `facebook.com`, and `pinterest.com`. These are
> manifest keys, not separate permissions, and are covered by the `<all_urls>`
> justification above; mention them if a reviewer asks about the MAIN world.

---

## 5. Required visual assets

Assets live in `assets/v2/`. The **screenshots are real captures** of the built
extension: `assets/v2/src/capture-screenshots.mjs` loads `.output/chrome-mv3`
into Chromium (Playwright), drives the on-page bubble over a local gallery page,
and screenshots the genuine UI at exact 1280×800 (run it from the repo so
`node_modules` resolves; `yarn build` first). The same harness also exports
`panel-real.png` — the real panel on transparent alpha. The **promo tiles** are
rendered from HTML via `assets/v2/src/render.js`: the marquee, small, and Opera
tiles composite that **real captured panel** over the brand canvas (no mock UI);
store-logo is pure brand art (icon + wordmark). Seven screenshots are provided;
the **Chrome Web Store shows up to 5**, so upload 1–5 there (Edge/Firefox allow
more — add 6–7).

| Asset              | Size                | Required                 | File / shot                                                                     |
|--------------------|---------------------|--------------------------|---------------------------------------------------------------------------------|
| Store icon         | 128×128             | required                 | ✅ `src/public/icon/128.png`                                                     |
| Screenshot 1       | 1280×800            | ✅ (≥1 required)          | ✅ `assets/v2/screenshot-1-grab-1280x800.png` — real popup over a page: media grid, toolbar, Download 14 |
| Screenshot 2       | 1280×800            | optional                 | ✅ `assets/v2/screenshot-2-preview-1280x800.png` — preview modal (dimensions, type, source) |
| Screenshot 3       | 1280×800            | optional                 | ✅ `assets/v2/screenshot-3-settings-1280x800.png` — settings: folder tokens, naming, convert |
| Screenshot 4       | 1280×800            | optional                 | ✅ `assets/v2/screenshot-4-filters-1280x800.png` — filters: format / size / base64, search, sort |
| Screenshot 5       | 1280×800            | optional                 | ✅ `assets/v2/screenshot-5-favourites-1280x800.png` — favourites saved across pages |
| Screenshot 6       | 1280×800            | optional                 | ✅ `assets/v2/screenshot-6-excluded-1280x800.png` — Excluded-sources blocklist (host / URL) |
| Screenshot 7       | 1280×800            | optional                 | ✅ `assets/v2/screenshot-7-history-1280x800.png` — download history with re-download / open / reveal |
| Small promo tile   | 440×280             | optional                 | ✅ `assets/v2/promo-small-440x280.png`                                              |
| Marquee promo tile | 1400×560            | optional (featured only) | ✅ `assets/v2/promo-marquee-1400x560.png`                                           |
| Store logo (Edge)  | 300×300             | required (Edge)          | ✅ `assets/v2/store-logo-300x300.png`                                               |
| Opera promo        | 300×188             | optional (Opera)         | ✅ `assets/v2/opera-promo-300x188.png`                                              |

The promo tiles carry the brand mark (the toolbar icon), the wordmark, the
"images · video · audio, original quality" message, and the real panel — to
regenerate, run the capture harness first (produces `panel-real.png`) then
`node assets/v2/src/render.js` from the repo so `node_modules` resolves. Tip:
shoot each screenshot in both light and dark once and pick the stronger — the
UI supports both.

---

## 6. Privacy & data disclosures (Privacy tab)

**Privacy policy URL:**

```
https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md
```

(The repository is public, so this resolves for reviewers. Keep it current by
editing `PRIVACY.md` on `main`.)

**Single purpose:** as in §3.

**Data usage — what this item collects:** none of the listed categories.
Explicitly answer *No* to: personally identifiable information, health, financial
& payment, authentication, personal communications, location, web history, and
user activity. The extension does not collect or transmit user data. The optional
`notifications` permission only shows a local desktop toast and collects nothing;
the Instagram/X media sniffers read only what the page already loaded and send
nothing off-device.

**Certifications (check all three):**

- I do not sell or transfer user data to third parties outside of approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Remote code:** No. All code is bundled in the package; nothing is fetched and
executed at runtime.

---

## 7. Build & upload

WXT packages a store-ready zip per browser:

```bash
corepack yarn zip          # chrome  → .output/media-bulk-downloads-<version>-chrome.zip
corepack yarn zip:edge     # edge    → …-edge.zip
corepack yarn zip:firefox  # firefox → …-firefox.zip (+ a -sources.zip for AMO)
corepack yarn zip:all      # all of the above
```

Version comes from `package.json` (WXT writes it into every manifest).

**Chrome Web Store (first submission):**

1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Add new item**.
2. Upload `…-chrome.zip`.
3. Fill the listing (§2), privacy (§6), and permission justifications (§4).
4. Add screenshots (§5) and the 128×128 icon.
5. Submit for review.

**Updating the live listing:** open the existing item → **Package → Upload new
package** → upload the new `…-chrome.zip` (its `version` must be higher than the
live one). Add a justification for any newly-added permission (§4) before
submitting. See §8 for the automated (tag-triggered) path.

**Microsoft Edge Add-ons:** upload `…-edge.zip` to
[Partner Center](https://partner.microsoft.com/dashboard/microsoftedge). Same
package family (Chromium MV3); the listing copy and justifications above apply.

**Firefox Add-ons (AMO):** upload `…-firefox.zip` at
[addons.mozilla.org/developers](https://addons.mozilla.org/developers/), plus the
`…-sources.zip` when prompted (AMO requires source for bundled add-ons).

**To ship an update:** bump `version` in `package.json`, re-run `yarn zip:all`,
upload the new zips. One version bump keeps every manifest in sync.

---

## 8. Automated release (CI)

`.github/workflows/release.yml` runs on every pushed version tag (`vX.Y.Z`): it
re-validates (lint / type-check / tests), packages all browser zips, publishes a
**GitHub Release** with them attached, and pushes the **Chrome** zip to the Web
Store. The workflow first checks the tag matches `package.json` and skips the
store publish (with a warning, release still succeeds) when the Chrome secrets
are not set — so it is safe to add before configuring them.

Configure these repository secrets (**Settings → Secrets and variables →
Actions**) to enable the Chrome Web Store publish:

| Secret                 | What it is                                                                                                                                                                                                               |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `CHROME_EXTENSION_ID`  | the item id (`jmdhkdengijmmkelofaleinbipophckn`)                                                                                                                                                                         |
| `CHROME_PUBLISHER_ID`  | your developer-account **publisher ID** — required by `chrome-webstore-upload` v6+. Find it on the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Account** (the numeric/string publisher id). |
| `CHROME_CLIENT_ID`     | OAuth client id for the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api)                                                                                                                     |
| `CHROME_CLIENT_SECRET` | OAuth client secret                                                                                                                                                                                                      |
| `CHROME_REFRESH_TOKEN` | OAuth refresh token                                                                                                                                                                                                      |

Release flow:

```bash
# 1. bump version + cut CHANGELOG on a branch, merge to main
# 2. tag the merge commit and push
git tag -a v1.2.0 -m "v1.2.0" && git push origin v1.2.0
# → release.yml validates, builds, creates the GitHub Release,
#   and (if secrets set) publishes to the Chrome Web Store.
```

Edge (Partner Center) and Firefox (AMO) publishing stay manual for now; their
zips are still attached to each GitHub Release.
