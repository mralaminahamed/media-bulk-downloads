---
title: "Settings reference"
description: "Every setting in one place, grouped by the tab it lives in, with its default value and what it does."
---

Settings live in the popup's Settings sheet, split across four tabs. They are
stored per browser profile in `chrome.storage.sync`, so they follow you across
devices signed into the same browser. Changing a default here never touches media
you've already collected or downloaded.

The tables below list every setting, its default, and what it controls.

## Downloads

| Setting | Default | What it does |
|---|---|---|
| Save to subfolder | empty (Downloads root) | Folder template under your Downloads folder. Supports the `{host}`, `{domain}`, `{date}`, and `{kind}` tokens. See [Download paths](/media-bulk-downloads/guides/download-paths/). |
| File naming | Original | Original keeps each file's own name from its URL. Prefixed numbers them per file with a prefix. See [Download & queue](/media-bulk-downloads/guides/download/). |
| Filename prefix | `image_` | The prefix used in Prefixed mode (for example `image_1.jpg`). |
| Convert images on download | Off | Re-encode raster images to PNG or JPEG on save. See [Convert on download](/media-bulk-downloads/guides/convert-on-download/). |
| Metadata (when converting) | Preserve | Preserve copies EXIF/XMP across the re-encode; Strip removes it. |
| Ask where to save each file | Off | When on, the browser prompts for a location per file. |
| Simultaneous downloads | 5 | How many downloads run at once (1 to 10). |
| Notify when downloads finish | Off | Desktop toast when a batch completes. Requests the notifications permission when enabled. |
| Stream capture quality | Auto | Target rendition for captured streams (auto / best / worst / 1080 / 720 / 480). See [Stream capture](/media-bulk-downloads/guides/stream-capture/). |
| Audio download format | M4A | M4A passthrough, or transcode to MP3 (128 / 192 / 320 kbps). |
| Skip images already downloaded | On | Skip re-saving files already on disk (matched by canonical URL). |
| Near-duplicate similarity threshold (Advanced) | 8 | Hamming-distance cutoff for [Find near-duplicates](/media-bulk-downloads/guides/near-duplicates/). Range 2 to 16; lower is stricter. |

## Media

| Setting | Default | What it does |
|---|---|---|
| Minimum image size | 0 px | Hide images smaller than this on either edge. |
| Exclude Base64 images | Off | Skip inline `data:` images. |
| Exclude emoji | Off | Skip tiny emoji images. |
| Resolve exact originals (network requests) | Off | Fetch the exact highest-resolution file from supported hosts. See [Resolve originals](/media-bulk-downloads/how-it-works/resolve-originals/). |
| Capture video streams (HLS & DASH) | Off | Surface `.m3u8` / `.mpd` streams as capture items. See [Stream capture](/media-bulk-downloads/guides/stream-capture/). |
| Smart page defaults | On | Seed filters from the page type on first scan. |
| Remember scan behaviour per site | On | Reuse a site's learned deep-scan behaviour. |
| Deep scan: max items | 1000 | Stop after this many new items (50 to 5000). See [Deep scan](/media-bulk-downloads/guides/deep-scan/). |
| Deep scan: max time | 20 s | Stop after this many seconds (5 to 120). |
| Deep scan: max scroll steps | 40 | Stop after this many scrolls (5 to 200). |
| Deep scan: click "Load more" | Off | Also click load-more buttons during a deep scan. |

## Display

| Setting | Default | What it does |
|---|---|---|
| Thumbnail size | 120 px | Grid tile size (64 to 240). |
| Show image count on toolbar icon | On | Show the per-tab media count on the toolbar badge. A failed download shows a red count instead until you open the popup. See [Version badge](/media-bulk-downloads/how-it-works/badge/). |
| Show floating bubble on pages | On | Show the on-page bubble launcher. See [On-page bubble](/media-bulk-downloads/guides/bubble/). |
| Bubble corner / panel position | bottom-right / anchored | Where the bubble button sits and where its panel opens. |
| Popup width / height | 460 / 600 px | Popup size (width 320 to 800, height 400 to 600). |
| Preview size | 360 px | Full-size preview dimension (240 to 900). |
| Bubble width / height | 440 / 560 px | Bubble panel size. |

## Data

The Data tab is for backup and cleanup rather than toggles:

- **Export / import a backup** as a JSON file (settings, favourites, history, blocked sources). See [Backup & restore](/media-bulk-downloads/guides/backup-restore/).
- **Reset all settings** to their defaults.
- **Clear all local data** (history, favourites, blocked sources) in one step.

## Notes

- Settings sync through the browser's own `chrome.storage.sync`, not any server of ours. See the [privacy policy](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md).
- Corrupt or out-of-range values (from a hand-edited sync or an imported backup) are clamped to a safe range on load, so a bad value cannot break a scan or a download.
