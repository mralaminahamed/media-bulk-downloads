# Opera Add-ons — Submission Package

Everything needed to publish **Media Bulk Downloads** to the Opera Add-ons store
through the [Opera developer dashboard](https://addons.opera.com/developer/):
copy-paste listing fields, per-permission justifications, the privacy
disclosures, required visual assets, and the packaging steps.

Version at time of writing: **1.1.0** · Manifest **V3** (Chromium — the **same
package as the Chrome build**). This is the Opera sibling of
[CHROME_WEBSTORE.md](./CHROME_WEBSTORE.md) and [EDGE_ADDONS.md](./EDGE_ADDONS.md);
the listing copy is intentionally identical so every store matches.

> **Different from Chrome / Edge — don't miss these:**
> - Opera registration is **free** (Chrome charges a one-time $5).
> - You upload the **`…-chrome.zip`** — there is **no separate Opera build target**
>   in WXT; Opera runs the Chromium MV3 package as-is.
> - Review is **manual and can be slow** (days to a few weeks), unlike Chrome's
>   mostly-automated pass.
> - If reviewers ask for readable (un-minified) source, hand them the AMO
>   **`…-firefox-sources.zip`** you already produce — same tree, unbundled.
> - Opera has **no per-permission field** and **no native shields.io badge**.

---

## 1. Pre-submission checklist

- [ ] **Opera account** created and the developer agreement accepted at [addons.opera.com/developer](https://addons.opera.com/developer/).
- [ ] `wxt.config.ts` name/description correct; version comes from `package.json`. `yarn zip` emits the Chromium package `.output/media-bulk-downloads-<version>-chrome.zip`.
- [ ] Permissions match what ships: `downloads`, `downloads.open`, `storage`, `tabs`, `contextMenus`, `offscreen`, host `<all_urls>`; optional `notifications` and `declarativeNetRequestWithHostAccess` (both requested at runtime).
- [ ] Icons 16/32/48/128 present (`src/public/icon/`) — ✅ already in the build; Opera uses the manifest icons.
- [ ] Privacy policy hosted at a public URL (see §6): `https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md`.
- [ ] At least **1 screenshot** (see §5) — the 1280×800 shots from the Chrome package work as-is.
- [ ] **Promotional picture 300×188 PNG** ready for the moderator (see §5) — ✅ `assets/opera-promo-300x188.png`.
- [ ] `.output/media-bulk-downloads-<version>-chrome.zip` produced by `yarn zip` (the Chrome zip is the Opera upload).
- [ ] `…-firefox-sources.zip` on hand from `yarn zip:firefox` in case a reviewer requests source.
- [ ] Product description, category, and privacy answers filled in (below).

---

## 2. Store listing fields

**Name / title** (≤ 45 chars)
```
Media Bulk Downloads
```

**Short / summary description** (≤ 132 chars) — reuse the manifest description:
```
Bulk-download images, video & audio from any web page. Smart type filters, instant preview, original quality — fast and private.
```

**Category:** Productivity *(Opera also offers a **Downloads** category — either fits; pick Productivity to match the Chrome/Edge listings.)*

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

FILTER AND DOWNLOAD
• Filter by kind (image / video / audio), format, and size
• Download one item or the whole filtered set, with correct file extensions
• Choose a subfolder, a naming scheme, and whether to be asked where to save
• A download history with one-click re-download, open file, or reveal in folder

PRIVATE BY DESIGN
• Network-free by default: it only reads what the page already loaded
• No accounts, no analytics, no servers — everything runs locally in your browser
• Your settings and history never leave your device

An optional on-page bubble gives you the same tools in a draggable panel without
opening the toolbar popup.
```

---

## 3. Single-purpose description

```
Media Bulk Downloads finds the images, video, and audio on the web page the user
is viewing and lets them preview, filter, and download those files in bulk.
```

---

## 4. Permission justifications (paste into the submission comment / notes)

Opera has no per-permission field. Put these in the **submission's comment /
"notes to the moderator"** so the reviewer can map each permission to a use.

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

Capture from the running extension (`yarn build`, load `.output/chrome-mv3`
unpacked via `opera://extensions` → **Developer mode** → **Load unpacked**), then
crop to size. PNG or JPEG.

| Asset          | Size               | Required | Suggested shot                                                     |
|----------------|--------------------|----------|--------------------------------------------------------------------|
| Icon           | 64×64              | ✅ (manifest) | Ships in the build — `src/public/icon/64.png` (rendered from `assets/icon.svg`); Opera reads the manifest icons, no separate store logo needed |
| Screenshot 1   | 1280×800           | ✅ (≥1)   | Popup with a full media grid + type badges                        |
| Screenshot 2   | 1280×800           | optional | Filter toolbar in use (kind/format/size)                          |
| Screenshot 3   | 1280×800           | optional | Preview modal (with prev/next)                                    |
| Screenshot 4   | 1280×800           | optional | Settings sheet                                                    |
| Screenshot 5   | 1280×800           | optional | Download history with the open/reveal actions                    |
| **Promotional picture** | **300×188** | ✅ (moderator) | ✅ `assets/opera-promo-300x188.png` — brand mark + wordmark + "image, video & audio" tagline |

> **Opera-specific:** the moderator asks for a **300×188** promotional picture.
> It ships in the repo (`assets/opera-promo-300x188.png`, mirrors the Chrome
> small-promo tile). Attach it in the submission or send it when the moderator
> requests it.

Tip: the 1280×800 screenshots from the Chrome package can be reused here as-is.
Opera accepts common screenshot sizes (612×408 minimum); 1280×800 is well within
range. Shoot each in both light and dark once and pick the stronger — the UI
supports both.

---

## 6. Privacy & data disclosures

**Privacy policy URL:**
```
https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md
```
(The repository is public, so this resolves for reviewers. Keep it current by
editing `PRIVACY.md` on `main`.)

**Single purpose:** as in §3.

**Data collection:** none. This extension does **not** collect or transmit any
user data. Settings and history stay on the device.

**Remote code:** No. All code is bundled in the package; nothing is fetched and
executed at runtime. (Opera, like AMO, rejects add-ons that run remote code —
this build runs none.)

**Chromium compatibility:** the package is a standard Chromium MV3 build (the same
one that passes Chrome review), so no Opera-specific code changes are required.

---

## 7. Build & upload

WXT packages a store-ready Chromium zip that Opera accepts directly:

```bash
corepack yarn zip          # chrome  → .output/media-bulk-downloads-<version>-chrome.zip  ← the Opera upload
corepack yarn zip:firefox  # firefox → …-firefox.zip (+ a -sources.zip, handy if Opera asks for source)
corepack yarn zip:all      # all packages at once
```

Version comes from `package.json` (WXT writes it into every manifest). There is
**no `zip:opera`** — Opera runs the Chrome package.

**Opera Add-ons (developer dashboard):**
1. [addons.opera.com/developer](https://addons.opera.com/developer/) → open your **Media Bulk Downloads** extension (or **Upload new package / Add extension** for the first submission).
2. **Upload package** → `…-chrome.zip`.
3. **Listing** (per language) → paste the name, short + detailed description (§2), category (§2), and screenshots (§5).
4. **Metadata** → homepage / support URL and the privacy policy URL (§6).
5. **Moderator notes / comment** → paste the ready-made block in §8 (it folds in the §4 justifications and testing steps).
6. **Submit for moderation** → an Opera reviewer checks it manually; you get an email when it's approved and public.

### Identifiers (from the dashboard, after the first submission)

| Field    | Value                                                                 | Used for                          |
|----------|-----------------------------------------------------------------------|-----------------------------------|
| **Slug** | `media-bulk-downloads` *(Opera assigns it from the name — confirm)*   | Share link (below)                |

**Share link:** `https://addons.opera.com/en/extensions/details/media-bulk-downloads/`
(the slug is fixed once Opera assigns it — confirm the exact one in the dashboard
before publishing it anywhere).

**README badge:** shields.io has **no native Opera Add-ons badge**, so the README
carries no Opera version badge — the Chrome, Edge, and Firefox badges already
cover the shared version, which is identical across all stores.

**To ship an update:** bump `version` in `package.json`, re-run `yarn zip:all`,
upload the new `…-chrome.zip`, and resubmit for moderation. One version bump keeps
every manifest in sync across Chrome, Edge, Firefox, and Opera.

---

## 8. Notes for the moderator (ready to paste)

This is the exact text for the **submission comment / notes to the moderator**.
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

---

## 9. General tab — form fields (copy-paste)

The exact fields on the Opera dashboard **General** tab, in order, with the value
to paste (or why to leave a field blank). After filling these, go to **General →
Submit changes** to send the version to moderation.

**Service website URL** — *leave blank.*
```
(blank)
```
> Only for extensions connected to a service you own/develop for. Media Bulk
> Downloads is a standalone tool with no backing service, so this stays empty
> (Opera's note explicitly excludes personal repos/profiles).

**Extension support page URL**
```
https://github.com/mralaminahamed/media-bulk-downloads/issues
```

**Extension source code URL (public)**
```
https://github.com/mralaminahamed/media-bulk-downloads
```

**Extension source code URL (required only for Opera moderators)** — the package
is bundled/minified by WXT, so Opera requires this. Pin it to the tag matching the
uploaded version:
```
https://github.com/mralaminahamed/media-bulk-downloads/tree/v1.1.0
```
> Bump the tag each release so it always corresponds to the current package
> (`git tag v<version> && git push --tags`).

**Build instructions** — paste this so a reviewer can reproduce the uploaded
Chromium package from source:
```
Build environment
- OS: macOS, Linux, or Windows (WXT is cross-platform; the OS does not affect output)
- Node.js 22 (repo pins it in .nvmrc)
- Yarn 4.17.0 via Corepack (pinned in package.json "packageManager") — no global install needed

Steps
1. git clone https://github.com/mralaminahamed/media-bulk-downloads.git
2. cd media-bulk-downloads
3. git checkout v1.1.0            # the tag matching the uploaded version
4. corepack enable
5. corepack yarn install --immutable
6. corepack yarn zip             # builds and packages the Chromium zip

Output
- Uploaded package: .output/media-bulk-downloads-1.1.0-chrome.zip
- Unpacked build:   .output/chrome-mv3/  (its manifest.json matches the submitted package)
Built with WXT (https://wxt.dev); no other tooling required.
```

**License URL** (EULA section — MIT)
```
https://github.com/mralaminahamed/media-bulk-downloads/blob/main/LICENSE
```
> Use the URL **or** paste the full MIT text into *Full license text* — not both
> needed. The URL is enough since the repo is public.

**Privacy policy URL**
```
https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md
```
> Use the URL **or** paste the full text into *Full privacy policy text*. The URL
> is enough. This satisfies Opera's requirement to describe data handling — the
> policy states no user data (including location) is collected or transmitted.
