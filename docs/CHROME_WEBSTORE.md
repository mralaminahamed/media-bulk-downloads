# Chrome Web Store — Submission Package

Everything needed to publish **Media Bulk Downloads** to the Chrome Web Store:
copy-paste listing fields, per-permission justifications, the privacy
disclosures, required visual assets, and the packaging steps.

Version at time of writing: **1.0.0** · Manifest **V3**.

> **Live listing:** https://chromewebstore.google.com/detail/media-bulk-downloads/jmdhkdengijmmkelofaleinbipophckn

---

## 1. Pre-submission checklist

- [ ] One-time **$5 developer registration** paid on the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] `wxt.config.ts` name/description correct; version comes from `package.json`. `yarn build` emits `.output/chrome-mv3/manifest.json`.
- [ ] Permissions match what ships: `downloads`, `downloads.open`, `storage`, `tabs`, host `<all_urls>`.
- [ ] Icons 16/32/48/128 present (`src/public/icon/`) — ✅ already in the build.
- [ ] Privacy policy hosted at a public URL (see §6): `https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md`.
- [ ] At least **1 screenshot** at 1280×800 or 640×400 (see §5).
- [ ] `.output/media-bulk-downloads-<version>-chrome.zip` produced by `yarn zip`.
- [ ] Single-purpose description, permission justifications, and data disclosures filled in (below).

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

**Host permissions — `<all_urls>`**
```
The extension must read the media elements on whatever page the user runs it on,
which can be any site. It activates only when the user opens the popup or enables
the on-page panel. When the optional "resolve originals" setting is on, it also
fetches a higher-resolution version of a downloaded item directly from that
media's own CDN. It does not read or transmit page content for any other purpose.
```

---

## 5. Required visual assets

Capture from the running extension (`yarn build`, load `.output/chrome-mv3` unpacked), then
crop to the exact sizes. PNG or JPEG, no alpha needed.

| Asset | Size | Required | Suggested shot |
|---|---|---|---|
| Store icon | 128×128 | ✅ (have it) | `src/public/icon/128.png` |
| Screenshot 1 | 1280×800 or 640×400 | ✅ (≥1) | Popup with a full media grid + type badges |
| Screenshot 2 | 1280×800 or 640×400 | optional | Filter toolbar in use (kind/format/size) |
| Screenshot 3 | 1280×800 or 640×400 | optional | Preview modal (with prev/next) |
| Screenshot 4 | 1280×800 or 640×400 | optional | Settings sheet |
| Screenshot 5 | 1280×800 or 640×400 | optional | Download history with the open/reveal actions |
| Small promo tile | 440×280 | optional | Logo + "Bulk-download images, video & audio" |
| Marquee promo | 1400×560 | optional | Only if featured |

Tip: shoot each screenshot in both light and dark once and pick the stronger — the
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
user activity. The extension does not collect or transmit user data.

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

**Chrome Web Store:**
1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Add new item**.
2. Upload `…-chrome.zip`.
3. Fill the listing (§2), privacy (§6), and permission justifications (§4).
4. Add screenshots (§5) and the 128×128 icon.
5. Submit for review.

**Microsoft Edge Add-ons:** upload `…-edge.zip` to
[Partner Center](https://partner.microsoft.com/dashboard/microsoftedge). Same
package family (Chromium MV3); the listing copy and justifications above apply.

**Firefox Add-ons (AMO):** upload `…-firefox.zip` at
[addons.mozilla.org/developers](https://addons.mozilla.org/developers/), plus the
`…-sources.zip` when prompted (AMO requires source for bundled add-ons).

**To ship an update:** bump `version` in `package.json`, re-run `yarn zip:all`,
upload the new zips. One version bump keeps every manifest in sync.
