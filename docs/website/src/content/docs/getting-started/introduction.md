---
title: Introduction
description: What Media Bulk Downloads is, the four extension surfaces, and the design constraints behind passive, network-free collection.
---

Media Bulk Downloads finds every image, video, and audio file on the page you're
viewing and lets you preview, filter, and download them in bulk — quickly, and
without sending your browsing anywhere. It's a cross-browser (Chrome · Edge ·
Firefox · Opera · Safari) Manifest-V3 extension.

## Where to go next

| Guide | What it covers |
|-------|----------------|
| [Quick Start](./quick-start.md) | Install, build, load unpacked, first use |
| [Architecture](../how-it-works/architecture.md) | Monorepo layout, the four MV3 surfaces, and the message catalog |

## Workflows

| Guide | Flow |
|-------|------|
| [Collection Pipeline](../how-it-works/collection-pipeline.md) | How page media is discovered, resolved, de-duplicated, and shown |
| [Resolve Originals](../how-it-works/resolve-originals.md) | Opt-in, per-host fetch for the exact original file |
| [Deep Scan](../guides/deep-scan.md) | Opt-in auto-scroll that surfaces virtualized and lazy media |
| [Download & queue](../guides/download.md) | How selected media is named and saved through the service worker |
| [Download paths](../guides/download-paths.md) | Per-site folder templates (`{host}`, `{domain}`, `{date}`, `{kind}`) |
| [Download History](../guides/history.md) | The log of successful downloads: open, reveal, re-download |
| [Favourites](../guides/favourites.md) | The starred-media list and how it persists |
| [Version badge](../how-it-works/badge.md) | The per-tab media count on the toolbar icon |
| [In-page Bubble](../guides/bubble.md) | The injected floating launcher and its lifecycle |

## The four surfaces at a glance

```mermaid
flowchart LR
  subgraph Page["Web page"]
    CS["Content script<br/>content.ts + collect/extract"]
    BUB["In-page bubble<br/>(React in Shadow DOM)"]
  end
  SW["Service worker<br/>background.ts"]
  POP["Popup<br/>(React)"]

  POP -- "GET_IMAGES / DEEP_SCAN / DOWNLOAD_IMAGES" --> CS
  POP -- "DOWNLOAD_IMAGES" --> SW
  SW -- "GET_IMAGES (badge)" --> CS
  SW -- "TOGGLE_BUBBLE (icon click)" --> BUB
  CS --- BUB
  SW -- "chrome.downloads" --> DISK[("Downloads")]

  classDef sw fill:#e8ecff,stroke:#4f46e5,color:#17181c;
  classDef page fill:#eefaf0,stroke:#2f9e57,color:#17181c;
  class SW sw;
  class CS,BUB page;
```

## Design constraints (read before changing collection)

- **Passive collection is network-free.** The content script and badge derive
  metadata from the DOM and URL strings only — no `fetch`, `HEAD`, or preload
  while scanning.
- **Two things touch the network, neither during passive collection.**
  Image-size `HEAD` requests run only from the popup, against images the page
  already loaded, and stay on each image's own host (never the background badge
  path). **Resolve Originals** (`resolveOriginals`, off by default) is the only
  feature that contacts a host other than the page you're on: when on, the
  background resolves the exact original from one of ~20 supported hosts (Twitter/X,
  Wallhaven, Unsplash, Vimeo, Dailymotion, Bluesky, Pinterest, Reddit, Flickr,
  ArtStation, SoundCloud, Twitch, Loom, PeerTube, and more).
  See [Resolve Originals](../how-it-works/resolve-originals.md) for the full list.
- **Deep scan issues no requests of its own.** It scrolls and re-reads the DOM;
  the page loads its own media.
- **URL upgrades are conservative.** Only safe, path-based CDN rewrites. Signed
  URLs (`fbcdn.net`, `cdninstagram.com`) are left byte-identical, and every
  upgrade keeps the pre-upgrade URL as a `thumbnailSrc` fallback.

## See also

- [Collection Benchmark](../benchmark/overview.md) — live, reproducible upgrade measurements
- [Feature one-pager](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/docs/marketing/one-pager.md) — plain-language overview
- [Monorepo restructure](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/docs/architecture/monorepo-restructure.md) — packages/app design record
