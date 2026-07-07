# Firefox Add-ons (AMO) — Submission Package

Everything needed to publish **Media Bulk Downloads** to
[addons.mozilla.org](https://addons.mozilla.org/developers/): copy-paste listing
fields, permission notes, the privacy disclosures, required assets, and — the
part unique to Firefox — the **source-code submission and reproducible build
instructions** reviewers require.

Version at time of writing: **1.0.0** · Manifest **V3** (Firefox 109+). This is
the Firefox sibling of [CHROME_WEBSTORE.md](./CHROME_WEBSTORE.md) and
[EDGE_ADDONS.md](./EDGE_ADDONS.md); the listing copy is intentionally identical
so all three stores match.

> **Live listing:** https://addons.mozilla.org/en-US/firefox/addon/media-bulk-downloads/

> **Different from Chrome / Edge — don't miss these:**
> - AMO is **free**; you sign in with a Firefox account.
> - The add-on **ID is mandatory** and already baked into the manifest
>   (`browser_specific_settings.gecko.id` = `media-bulk-downloads@mralaminahamed`).
> - **Source code submission is mandatory** — the package is bundled/transpiled,
>   so you must upload the `…-sources.zip` *and* give reviewers reproducible
>   build steps (§7). This is the one thing Chrome/Edge don't ask for.
> - The manifest already declares **no data collection**
>   (`data_collection_permissions: { required: ['none'] }`).
> - Minimum supported Firefox is **109.0** (`strict_min_version`).

---

## 1. Pre-submission checklist

- [ ] **Firefox account** created and the AMO developer agreement accepted at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
- [ ] `wxt.config.ts` sets the Firefox `gecko.id`, `strict_min_version: '109.0'`, and `data_collection_permissions: { required: ['none'] }`. `yarn build:firefox` emits `.output/firefox-mv3/manifest.json`.
- [ ] Permissions match what ships: `downloads`, `downloads.open`, `storage`, `tabs`, host `<all_urls>`.
- [ ] Icons 16/32/48/128 present (`src/public/icon/`) — ✅ already in the build; AMO uses the manifest icons (no separate store logo).
- [ ] `yarn lint` and `wxt build -b firefox` pass clean (AMO runs its own validator on upload too).
- [ ] Privacy policy hosted at a public URL (see §6): `https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md`.
- [ ] At least **1 screenshot** (see §5).
- [ ] `.output/media-bulk-downloads-<version>-firefox.zip` **and** `…-firefox-sources.zip` produced by `yarn zip:firefox`.
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
**Support email:** `mrabir.ahamed@gmail.com`

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

## 3. Add-on identity & compatibility

| Field           | Value                                                                                                                       | Set in                                 |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------------|
| Add-on ID       | `media-bulk-downloads@mralaminahamed`                                                                                       | `browser_specific_settings.gecko.id`   |
| Minimum Firefox | `109.0`                                                                                                                     | `strict_min_version`                   |
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

**Host permissions — `<all_urls>`** — the extension must read the media elements
on whatever page the user runs it on, which can be any site. It activates only
when the user opens the popup or enables the on-page panel. When the optional
"resolve originals" setting is on, it also fetches a higher-resolution version of
a downloaded item directly from that media's own CDN. It does not read or
transmit page content for any other purpose.

---

## 5. Required visual assets

AMO uses the **manifest icons** (no separate store logo). Add screenshots to make
the listing land.

| Asset        | Size                          | Required           | Suggested shot                                |
|--------------|-------------------------------|--------------------|-----------------------------------------------|
| Add-on icon  | 128×128                       | ✅ (from manifest)  | `src/public/icon/128.png`                     |
| Screenshot 1 | 1280×800 (any ratio accepted) | ✅ (≥1 recommended) | Popup with a full media grid + type badges    |
| Screenshot 2 | 1280×800                      | optional           | Filter toolbar in use (kind/format/size)      |
| Screenshot 3 | 1280×800                      | optional           | Preview modal (with prev/next)                |
| Screenshot 4 | 1280×800                      | optional           | Settings sheet                                |
| Screenshot 5 | 1280×800                      | optional           | Download history with the open/reveal actions |

PNG or JPEG. The 1280×800 screenshots from the Chrome/Edge packages can be reused
here as-is.

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

**Upload:** `.output/media-bulk-downloads-<version>-firefox-sources.zip`
(produced alongside the package by `yarn zip:firefox`).

**Build instructions to paste (reviewer reproduces the package):**
```
Build environment
- OS: macOS, Linux, or Windows
- Node.js 22 (see .nvmrc)
- Yarn 4.17.0 via Corepack (pinned in package.json "packageManager")

Steps
1. corepack enable
2. corepack yarn install --immutable
3. corepack yarn zip:firefox

Output
- Package:  .output/media-bulk-downloads-<version>-firefox.zip
- Sources:  .output/media-bulk-downloads-<version>-firefox-sources.zip
The unpacked build is .output/firefox-mv3/ ; its manifest.json matches the
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

Version comes from `package.json` (WXT writes it into every manifest).

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
