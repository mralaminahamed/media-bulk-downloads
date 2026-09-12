---
title: "FAQ & troubleshooting"
description: "Answers to common questions and fixes for the problems people hit most: videos that won't download, empty scans, where files land, and more."
---

Most problems fall into one of the patterns below. If yours isn't here, or a fix
doesn't work, [report it](/media-bulk-downloads/help/report-an-issue/) and we'll take a look.

## Downloading

### A video won't download, or nothing lands in my Downloads folder

A few different things can cause this, so check which case matches:

- **The player streams from a `blob:` URL (MSE) or the stream is DRM-protected.**
  Sites like YouTube and most paid video services build the video in memory or
  encrypt it, so there is no single file to save. That media is not downloadable,
  by design.
- **It's an HLS or DASH stream.** Adaptive streams show in the grid tagged
  **HLS · capture**. Use Capture (not a plain download): the extension fetches the
  manifest and segments and assembles one file. Turn capture on under
  **Settings → Media → Capture video streams**. Live and DRM streams are refused.
- **"Ask where to save each file" is on and the Save dialog sat open a while.**
  Captured video is held in memory until you pick a location. Save reasonably
  promptly, or turn that browser setting off for silent saves.
- **It failed and you didn't see it.** A failed download shows as a red count on
  the toolbar icon and a failed row in the download queue. Open the popup, check
  the queue, and use Retry. If the file is hotlink-blocked (HTTP 403), try
  "Retry w/ referer".
- **Instagram/Facebook reels.** A reel that only shows its cover is collected once
  its real video is seen. Play or open the reel, then collect again.

### Where do my files go, and why are the names different?

By default files save to your browser's Downloads folder, and each file keeps its
own name from its URL (Original naming). You can change both in
**Settings → Downloads**: switch to a numbered prefix, or set a subfolder template
with `{host}`, `{domain}`, `{date}`, and `{kind}` tokens to sort each site into its
own folder.

### How do I download a whole ZIP instead of separate files?

Use the caret next to the Download button and choose "As ZIP archive". Files a CDN
blocks fall back to individual downloads automatically.

## Finding media

### The extension found nothing, or missed images

- Some pages load media only as you scroll. Run **Deep scan** to auto-scroll and
  pull in lazy-loaded and virtualized items. Tune its limits under
  **Settings → Media**.
- A few sites gate media behind login or serve it from `blob:`/canvas, which can't
  be collected. Reloading the page sometimes helps.
- To pull the highest-resolution originals on supported hosts, turn on
  **Settings → Media → Resolve exact originals** (off by default, makes network
  requests).

### There are lots of near-identical copies

Use **Find near-duplicates**. It hides lower-resolution copies of the same image
and keeps the largest. It's reversible from the Duplicates filter, and the
similarity threshold is configurable in Settings.

### Can I collect from more than one tab at once?

Yes. In the popup, use the scope selector to collect from all open tabs or a
selected set. Each file is tagged with the tab it came from.

## Interface

### What is the floating bubble, and how do I turn it off?

The bubble is an on-page panel with the same tools as the popup. It's on by
default. Toggle it under **Settings → Display → Show floating bubble on pages**.

### What does the number on the toolbar icon mean?

It normally shows how many media items are on the current tab. When a download
fails it turns red and shows the failed count instead, so you notice even with the
popup closed. Opening the popup clears it.

## Privacy & safety

### Does the extension send my data anywhere?

No. Collection reads only what the page already loaded, there are no accounts or
analytics, and settings and history stay on your device. The full policy is in
[PRIVACY.md](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md).
The one time it makes network requests is when you turn on Resolve originals or
capture a stream, and then it fetches directly from the site's own CDN.

### Is stream capture available on Firefox and Safari?

Yes. Chrome and Edge assemble streams in an offscreen document; Firefox and Safari
run the same capture core in an extension page.

## Still stuck?

[Report a bug or request a feature](/media-bulk-downloads/help/report-an-issue/).
For a security issue, please follow the private process in
[SECURITY.md](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/SECURITY.md).
