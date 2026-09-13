---
title: "Glossary"
description: "Plain definitions for the terms used across these docs and in the extension: HLS, DASH, deep scan, near-duplicate, resolver, sniffer, and more."
---

The terms below come up throughout the guides and in the extension itself. Each
links to the guide that covers it in full.

## Blob URL (MSE)

A `blob:` address points at data the page built in memory rather than a file on a
server. Players that use Media Source Extensions (YouTube and most paid video)
stream through blob URLs, so there is no single file to save. This media is not
downloadable by design.

## Bubble

The on-page floating panel that opens when you click the toolbar icon on a normal
page. It has the same tools as the popup. See
[On-page bubble](/media-bulk-downloads/guides/bubble/).

## Cover-only (poster-only) video

A video that a page shows only as its still cover image, with no video file loaded
yet. The extension does not collect these as images. Play or open the video so its
real file appears, then collect again.

## DASH

Dynamic Adaptive Streaming over HTTP, an adaptive video format delivered as an
`.mpd` manifest plus segments. The extension can capture it into one file. See
[Stream capture](/media-bulk-downloads/guides/stream-capture/).

## Deep scan

An opt-in pass that auto-scrolls a page to surface lazy-loaded and virtualized
media that a plain scan misses. See [Deep scan](/media-bulk-downloads/guides/deep-scan/).

## HLS

HTTP Live Streaming, an adaptive video format delivered as an `.m3u8` manifest
plus segments. The extension can capture it, including AES-128 decryption. See
[Stream capture](/media-bulk-downloads/guides/stream-capture/).

## Hotlink protection

A server that only serves a file when the request looks like it came from the
site's own page, and returns HTTP 403 otherwise. **Retry w/ referer** recovers
these by sending the source page as the `Referer`. See
[The download queue](/media-bulk-downloads/guides/download-queue/).

## Near-duplicate

A copy of the same image at a different size or after a re-encode, which exact-URL
de-duplication cannot catch. The near-duplicate pass compares the images
themselves and keeps the largest. See
[Find near-duplicates](/media-bulk-downloads/guides/near-duplicates/).

## Perceptual hash

A short fingerprint of an image's appearance that stays close for two versions of
the same picture even at different resolutions. It is how the near-duplicate pass
groups copies.

## Resolve originals

An opt-in setting that fetches the exact highest-resolution file from supported
hosts, the one time the extension contacts a site other than the page you are on.
See [Resolve originals](/media-bulk-downloads/how-it-works/resolve-originals/).

## Resolver

The per-site logic that turns a page's media URL into the best downloadable
candidate, for example rewriting a CDN thumbnail to full size. See the
[collection pipeline](/media-bulk-downloads/how-it-works/collection-pipeline/).

## Sidecar (.json)

An optional sibling `<name>.json` file saved next to each download with its source
URL, page, alt text, and dimensions, for archiving provenance. See the
[settings reference](/media-bulk-downloads/reference/settings/).

## Signed URL / expired link

A media URL that carries a time-limited signature. Once it expires the same URL
can never succeed again, so a failed download shows **Link expired**; reopen the
page and collect again for a fresh one.

## Sniffer

Logic that reads a site's own network responses (in the page's context) to find
media a plain DOM scan cannot see, used for a few gallery and social sites. See the
[collection pipeline](/media-bulk-downloads/how-it-works/collection-pipeline/).

## Toolbar badge

The small count on the extension's toolbar icon: the number of media items on the
current tab, or a red failed-download count until you open the popup. See
[Version badge](/media-bulk-downloads/how-it-works/badge/).

## Related

- [Settings reference](/media-bulk-downloads/reference/settings/)
- [Permissions & privacy](/media-bulk-downloads/reference/permissions/)
- [FAQ & troubleshooting](/media-bulk-downloads/help/faq/)

---
