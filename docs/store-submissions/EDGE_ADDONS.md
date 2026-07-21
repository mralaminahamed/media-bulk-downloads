# Microsoft Edge Add-ons — Submission Package

Everything needed to publish **Media Bulk Downloads** to the Microsoft Edge
Add-ons store through [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge):
copy-paste listing fields, per-permission justifications, the privacy
disclosures, required visual assets, and the packaging steps.

Version at time of writing: **1.3.0** · Manifest **V3** (Chromium — same package
family as the Chrome build). This is the Edge sibling of
[CHROME_WEBSTORE.md](./CHROME_WEBSTORE.md); the listing copy is intentionally
identical so both stores match.

> **✅ Live** — the extension passed certification and is published at
> <https://microsoftedge.microsoft.com/addons/detail/media-bulk-downloads/ihhhecmabfocelgmjafijchhhlpdlnll>.
> This doc is now the reference for shipping **updates** (see §7 "To ship an
> update").

> **Different from Chrome — don't miss these:**
> - Edge registration is **free** (Chrome charges a one-time $5).
> - Edge requires a **300×300** store logo (Chrome uses the 128×128 icon).
> - You upload the **`…-edge.zip`**, not the Chrome zip.
> - Justifications go in the **certification notes**, not per-permission fields.

---

## 1. Pre-submission checklist

- [ ] **Partner Center account** registered for the *Microsoft Edge* program (free — no registration fee).
- [ ] `wxt.config.ts` name/description correct; version comes from `apps/extension/package.json`. `yarn build:edge` emits `apps/extension/.output/edge-mv3/manifest.json`.
- [ ] Permissions match what ships: `downloads`, `downloads.open`, `storage`, `tabs`, `contextMenus`, `offscreen`, host `<all_urls>`; optional `notifications` and
  `declarativeNetRequestWithHostAccess` (both requested at runtime).
- [ ] Icons 16/32/48/128 present (`apps/extension/src/public/icon/`) — ✅ already in the build.
- [ ] **Store logo 300×300 PNG** ready (Edge-specific, see §5) — ✅ `assets/v2/store-logo-300x300.png`.
- [ ] Privacy policy hosted at a public URL (see §6): `https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md`.
- [ ] At least **1 screenshot** at 1280×800 (or 640×480) (see §5).
- [ ] `apps/extension/.output/media-bulk-downloads-<version>-edge.zip` produced by `yarn zip:edge`.
- [ ] Product description, category, search terms, privacy answers, and certification notes filled in (below).

---

## 2. Store listing fields

**Name / display name** (≤ 50 chars)

```
Media Bulk Downloads
```

**Short description** (≤ 132 chars) — reuse the manifest description:

```
Bulk-download images, video & audio from any web page. Smart type filters, instant preview, original quality — fast and private.
```

**Category:** Productivity

**Language:** English (United States)

**Search terms** (up to **7**, ≤ 30 chars each):

```
bulk download
image downloader
video downloader
media downloader
download all images
gallery downloader
save images
```

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

FILTER AND DOWNLOAD
• Filter by kind (image / video / audio), format, and size
• Download one item or the whole filtered set, with correct file extensions
• Choose a subfolder, a naming scheme, and whether to be asked where to save
• A download history with one-click re-download, open file, or reveal in folder

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
• A resilient download queue tracks each file and resumes after the popup closes —
  pause, resume, cancel, retry, and a "simultaneous downloads" cap
• "Retry with page referer" recovers hotlink-protected files that return 403
• Filter by Downloaded / Not-downloaded, and exclude sources you never want to see

PRIVATE BY DESIGN
• Network-free by default: it only reads what the page already loaded
• No accounts, no analytics, no servers — everything runs locally in your browser
• Your settings and history never leave your device

An optional on-page bubble gives you the same tools in a draggable panel without
opening the toolbar popup.
```

---

## 3. Product / single-purpose description

```
Media Bulk Downloads finds the images, video, and audio on the web page the user
is viewing and lets them preview, filter, and download those files in bulk.
```

---

## 4. Permission justifications (paste into Certification notes)

Edge has no per-permission field like Chrome; put these in **Notes for
certification** so the reviewer can map each permission to a use.

**downloads**

```
Saves the images, video, and audio the user selects to their computer through
the browser's download manager. This is the extension's core action.
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

**Host permissions — `<all_urls>`**

```
The extension must read the media elements on whatever page the user runs it on,
which can be any site. It activates only when the user opens the popup or enables
the on-page panel. When the optional "resolve originals" setting is on, it also
fetches a higher-resolution version of a downloaded item directly from that
media's own CDN. It does not read or transmit page content for any other purpose.
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

**Testing note for the reviewer**

```
Open any image-heavy page (e.g. a Wikipedia gallery or a news article), click the
toolbar icon, and the popup lists every media item found. No sign-in, account, or
server is required — all functionality is local.
```

---

## 5. Required visual assets

Capture from the running extension (`yarn build:edge`, load `apps/extension/.output/edge-mv3`
unpacked via `edge://extensions` → **Load unpacked**), then crop to the exact
sizes. PNG or JPEG.

| Asset                  | Size                  | Required        | Suggested shot                                                                                                 |
|------------------------|-----------------------|-----------------|----------------------------------------------------------------------------------------------------------------|
| **Store logo**         | **300×300**           | ✅ Edge-specific | ✅ `assets/v2/store-logo-300x300.png` — brand tile on a soft brand-tinted ground (rendered from `assets/v1/icon.svg`) |
| Screenshot 1           | 1280×800 (or 640×480) | ✅ (≥1)          | Popup with a full media grid + type badges                                                                     |
| Screenshot 2           | 1280×800 (or 640×480) | optional        | Filter toolbar in use (kind/format/size)                                                                       |
| Screenshot 3           | 1280×800 (or 640×480) | optional        | Preview modal (with prev/next)                                                                                 |
| Screenshot 4           | 1280×800 (or 640×480) | optional        | Settings sheet                                                                                                 |
| Screenshot 5           | 1280×800 (or 640×480) | optional        | Download history with the open/reveal actions                                                                  |
| Small promotional tile | 440×280               | optional        | Logo + "Bulk-download images, video & audio"                                                                   |
| Large promotional tile | 1400×560              | optional        | Only if featured / for collections                                                                             |

Tip: shoot each screenshot in both light and dark once and pick the stronger —
the UI supports both. The 1280×800 shots from the Chrome package can be reused
here as-is.

---

## 6. Privacy & data disclosures

Set under **Properties** and the **Store listing → Additional information**.

**Privacy policy URL:**

```
https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md
```

(The repository is public, so this resolves for reviewers. Keep it current by
editing `PRIVACY.md` on `main`.)

**Single purpose:** as in §3.

**Data collection:** none. This extension does **not** collect or transmit any
user data. Answer *No* to every personal-data / usage category the form offers
(identifiers, financial, authentication, personal communications, location, web
history, user activity). Settings and history stay on the device.

**Does this extension require a privacy policy?** Yes — provide the URL above
(it requests broad host access and the `downloads`/`tabs` permissions, so a
policy is expected even though nothing is collected).

**Remote code:** No. All code is bundled in the package; nothing is fetched and
executed at runtime.

**Notarization / Chromium compatibility:** the package is a standard Chromium
MV3 build (same one that passes Chrome review), so no Edge-specific code changes
are required.

---

## 7. Build & upload

WXT packages a store-ready zip per browser:

```bash
corepack yarn zip:edge     # edge    → apps/extension/.output/media-bulk-downloads-<version>-edge.zip
corepack yarn zip          # chrome  → …-chrome.zip
corepack yarn zip:firefox  # firefox → …-firefox.zip (+ a -sources.zip for AMO)
corepack yarn zip:all      # all of the above
```

Version comes from `apps/extension/package.json` (WXT writes it into every manifest).

**Microsoft Edge Add-ons (Partner Center):**

1. [Partner Center → Microsoft Edge](https://partner.microsoft.com/dashboard/microsoftedge) → open your **Media Bulk Downloads** extension (or **Create new extension** for the first submission).
2. **Packages** → upload `…-edge.zip`.
3. **Store listing** (per language) → paste the name, short + detailed description (§2), search terms (§2), screenshots and the **300×300 store logo** (§5), and the privacy policy URL (§6).
4. **Properties** → category **Productivity**, supported languages, and the privacy/data answers (§6).
5. **Availability** → markets (all) and visibility (public).
6. **Notes for certification** → paste the ready-made block in §8 (it folds in the §4 justifications and testing steps).
7. **Publish** → the submission goes to certification; you get an email when it's live.

### Identifiers (from Partner Center → Extension overview)

| Field            | Value                                                                                                      | Used for                                                                     |
|------------------|------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| **Live listing** | `https://microsoftedge.microsoft.com/addons/detail/media-bulk-downloads/ihhhecmabfocelgmjafijchhhlpdlnll`   | Public store page (live) — the link in the README and store table            |
| **Store ID**     | `0RDCKGS01KRC`                                                                                              | Short share link: `https://microsoftedge.microsoft.com/addons/detail/0RDCKGS01KRC` (redirects to the slug URL above) |
| **CRX ID**       | `ihhhecmabfocelgmjafijchhhlpdlnll`                                                                          | The README version badge (Microsoft's `getproductdetailsbycrxid` API) and the live listing slug |
| Product ID       | *(kept private — internal Partner Center GUID)*                                                            | Dashboard deep-links only                                                    |

**README badge:** shields.io has **no native Edge Add-ons badge** (open request
[badges/shields#4690](https://github.com/badges/shields/issues/4690)), so the
README uses a **dynamic** badge that reads the live version from Microsoft's own
endpoint by CRX ID:

```
https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/ihhhecmabfocelgmjafijchhhlpdlnll
```

Now that the extension is certified, the badge reads the live version
automatically — no manual bump needed. (It showed `not found` in red until
certification passed.)

**To ship an update:** bump `version` in `package.json`, re-run `yarn zip:all`,
upload the new `…-edge.zip` in **Packages**, and resubmit. One version bump keeps
every manifest in sync across Chrome, Edge, and Firefox.

---

## 8. Notes for certification (ready to paste, < 2,000 chars)

This is the exact text for the **Publish → Notes for certification** field.
Customers never see it; it's for the review team. It consolidates the §4
justifications and testing steps into one block.

```
No test account is required. The extension needs no sign-in, account, or server — all features work locally and offline by default. There are no dependencies on other products, backends, or companion apps.

HOW TO TEST
1. Open any image-heavy page (e.g. a Wikipedia gallery or a news article with photos/video).
2. Click the toolbar icon. The popup lists every image, video, and audio file found on the page.
3. Filter by kind (image/video/audio), format, or size; click a tile to preview; click Download to save one item or the whole filtered set.

CONDITIONAL / NON-OBVIOUS FEATURES
- On-page bubble: a draggable panel with the same tools, without opening the popup. Enable it in Settings ("Show on-page bubble").
- Deep scan: an optional, bounded auto-scroll (button in the popup) that surfaces media on infinite-scroll / virtualized pages.
- Resolve exact originals: OFF by default (Settings). When on, it fetches the highest-resolution file for several supported media hosts (e.g. Twitter, Wallhaven, Unsplash, Vimeo, Reddit, Bluesky, Pinterest, Flickr, ArtStation) directly from that media's own CDN. This is the only feature that contacts a host other than the current page.
- Download history: re-download, open file, or reveal in folder.

PERMISSIONS
downloads / downloads.open: save and reopen files. storage: local settings + history on the device. tabs: label a download with its source page and open that page on request. contextMenus: right-click download / favourite actions. offscreen: assemble HLS/DASH streams (fetch + join segments) on-device. Host <all_urls>: read media on whatever page the user runs it on; activates only when the user opens the popup or the on-page panel. notifications (optional, runtime): desktop toast when a batch finishes. declarativeNetRequestWithHostAccess (optional, runtime): retry a hotlink-blocked download (HTTP 403) with a temporary single-URL rule setting Referer/Origin to the item's source page — user-initiated downloads only, removed right after.

PRIVACY
No data is collected or transmitted; no remote code is executed. Settings and history never leave the device.
```

