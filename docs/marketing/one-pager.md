# Media Bulk Downloads — One-Pager

**Grab every image, video, and audio file on a page — at original quality — in one click. Private by default.**

A cross-browser (Chrome · Edge · Firefox · Safari) Manifest V3 extension that turns any web page into a clean, filterable gallery of its media, then downloads what you pick — or everything — with the originals, not the thumbnails.

---

## What it does

- **One-click collection.** Opens a live preview of every image, video, and audio file on the current page — including lazy-loaded, `srcset`, `<picture>`, CSS-background, and shadow-DOM media a right-click would miss.
- **Original quality, automatically.** Recognizes the size/resize patterns of **90+ major image hosts and CDN families** and rewrites a thumbnail to its full-resolution original before you download.
- **Bulk or precise.** Download a single item, a filtered set (by type, format, dimensions, or size), or the whole page. A resilient queue handles large batches and resumes cleanly.
- **Stream capture.** Assembles HLS/DASH video and audio streams into a single downloadable file.
- **Stays organized.** Custom folder templates, filename modes, download history, and a favourites list.

## Why it's different

**🔒 Private by default — network-free collection.**
Collecting media reads the page's DOM and rewrites URL strings. It issues **no background requests, forges no traffic, and phones home to no one.** Any network use (e.g. fetching a true original from a public API) is **opt-in** and off until you enable it.

**🎯 Original quality, not guesswork.**
Instead of blindly appending `?full`, it applies host-specific rules verified against real pages — so the upgraded link actually resolves to a larger file, and a signed or already-original URL is **left untouched** rather than broken.

**🛡️ Respects protections.**
Signed and token-bound URLs are collected exactly as served — never stripped in a way that would break them. Protected/ciphered streams are left alone. The extension does not bypass access controls or fabricate private API calls.

**🌐 Broad, real-world coverage.**
Validated across e-commerce, news publishing, stock-photo, wiki/reference, and image-gallery sites — the CDN families that serve the bulk of the visual web.

## Proven, not promised

An open, reproducible [collection benchmark](https://mralaminahamed.github.io/media-bulk-downloads/benchmark/overview/) injects the extension's **actual** collection engine into live pages and measures what it finds — logged-out, first-viewport, network-free. In those runs it upgraded the **majority of collected images to their original resolution** across e-commerce, publishing, stock-photo, and wiki sites, while correctly leaving signed originals byte-identical. The method is documented end-to-end so anyone can re-run it.

## At a glance

| | |
|---|---|
| **Platforms** | Chrome, Edge, Firefox 140+, Safari (Manifest V3) |
| **Media types** | Images (incl. `srcset`/`<picture>`/CSS backgrounds), video, audio, HLS/DASH streams |
| **Privacy** | Network-free by default · no tracking · no account · no data collection |
| **Filters** | Type, format, dimensions, size, include/exclude inline (Base64) |
| **Extras** | Download queue, history, favourites, custom folder/filename templates, on-page bubble |
| **Price** | Free · open source (MIT) |

---

*Media Bulk Downloads is an independent tool. All third-party site and service names are trademarks of their respective owners and are used only to describe general compatibility. Users are responsible for complying with the terms of service and copyright of the sites they use it on.*
