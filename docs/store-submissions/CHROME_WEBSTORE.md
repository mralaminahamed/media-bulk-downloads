# Chrome Web Store — Submission Package

Everything needed to publish **Media Bulk Downloads** to the Chrome Web Store:
copy-paste listing fields, per-permission justifications, the privacy
disclosures, required visual assets, and the packaging steps.

Version at time of writing: **1.1.0** · Manifest **V3**.

> **Live listing:** https://chromewebstore.google.com/detail/media-bulk-downloads/jmdhkdengijmmkelofaleinbipophckn

---

## 1. Pre-submission checklist

- [ ] One-time **$5 developer registration** paid on the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] `wxt.config.ts` name/description correct; version comes from `package.json`. `yarn build` emits `.output/chrome-mv3/manifest.json`.
- [ ] Permissions match what ships: `downloads`, `downloads.open`, `storage`, `tabs`, `contextMenus`, `offscreen`, host `<all_urls>`.
- [ ] Optional permission declared: `notifications` (requested at runtime, not at install — see §4).
- [ ] `commands` (keyboard shortcuts) and the MAIN-world content scripts (page + Instagram/X media sniffers) are present — no extra permission needed, but note them for review (see §4).
- [ ] Icons 16/32/48/64/128 present (`src/public/icon/`) — ✅ already in the build.
- [ ] Privacy policy hosted at a public URL (see §6): `https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md`.
- [ ] At least **1 screenshot** at 1280×800 or 640×400 (see §5) — ✅ `assets/screenshot-1280x800.png`.
- [ ] Promo tiles (optional): small 440×280 + marquee 1400×560 — ✅ in `assets/` (`promo-small-440x280.png`, `promo-marquee-1400x560.png`).
- [ ] `.output/media-bulk-downloads-<version>-chrome.zip` produced by `yarn zip`.
- [ ] Single-purpose description, permission justifications, and data disclosures filled in (below).

> **Updating the existing listing:** 1.1.0 adds `contextMenus`, `offscreen`, and
> optional `notifications` over the 1.0.0 listing. Added permissions trigger a
> fuller re-review and may re-prompt existing users to accept them — fill a
> justification for each new permission (§4) before submitting.

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

MORE PLACES TO GRAB MEDIA
• Dedicated resolvers for Instagram, X/Twitter, Vimeo, and YouTube poster images
• Capture standard HLS (.m3u8) video streams to a single file (no DRM, no live)
• Optional WebP/AVIF → PNG/JPEG conversion as images download

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

**Host permissions — `<all_urls>`**
```
The extension must read the media elements on whatever page the user runs it on,
which can be any site. It activates only when the user opens the popup or enables
the on-page panel. Small content scripts read the page's media; on a few sites
(e.g. Instagram, X/Twitter) a passive script observes the page's own media
network responses so posted images/videos resolve to real downloadable files —
it reads only the request URLs/JSON the page itself already loaded and never
sends them off-device. When the optional "resolve originals" setting is on, or
when capturing an HLS stream, it fetches the higher-resolution file or the
stream's segments directly from that media's own CDN. It does not read or
transmit page content for any other purpose.
```

> **Content scripts / `commands`:** the manifest also declares keyboard shortcuts
> (`commands`) and four content scripts — a page collector plus MAIN-world media
> sniffers scoped to `instagram.com`, `x.com`, and `twitter.com`. These are
> manifest keys, not separate permissions, and are covered by the `<all_urls>`
> justification above; mention them if a reviewer asks about the MAIN world.

---

## 5. Required visual assets

Icon and promo tiles already live in the repo (`assets/`, `src/public/icon/`).
Screenshots are captured from the running extension (`yarn build`, load
`.output/chrome-mv3` unpacked) and cropped to the exact size. PNG or JPEG, no alpha.

| Asset | Size | Required | File / suggested shot |
|---|---|---|---|
| Store icon | 128×128 | required | ✅ `src/public/icon/128.png` |
| Screenshot 1 | 1280×800 or 640×400 | ✅ (≥1 required) | ✅ `assets/screenshot-1280x800.png` — popup with a full media grid + type badges |
| Screenshot 2 | 1280×800 or 640×400 | optional | Filter toolbar in use (kind/format/size) |
| Screenshot 3 | 1280×800 or 640×400 | optional | Preview modal (with prev/next + the exclude menu) |
| Screenshot 4 | 1280×800 or 640×400 | optional | Settings sheet |
| Screenshot 5 | 1280×800 or 640×400 | optional | Download history with the open/reveal actions |
| Screenshot 6 | 1280×800 or 640×400 | optional | Selection + ZIP / copy-links menu |
| Screenshot 7 | 1280×800 or 640×400 | optional | Favourites / Excluded-sources panel |
| Small promo tile | 440×280 | optional | ✅ `assets/promo-small-440x280.png` |
| Marquee promo tile | 1400×560 | optional (featured only) | ✅ `assets/promo-marquee-1400x560.png` |

The two promo tiles carry the brand mark (the toolbar icon), the wordmark, and the
"images · video · audio, original quality" message — regenerate them from the
source in `assets/` if the branding ever changes. Tip: shoot each screenshot in
both light and dark once and pick the stronger — the UI supports both.

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

| Secret | What it is |
|--------|-----------|
| `CHROME_EXTENSION_ID` | the item id (`jmdhkdengijmmkelofaleinbipophckn`) |
| `CHROME_CLIENT_ID` | OAuth client id for the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api) |
| `CHROME_CLIENT_SECRET` | OAuth client secret |
| `CHROME_REFRESH_TOKEN` | OAuth refresh token |

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
