# Media Bulk Downloads — Guides

Developer and user documentation for the extension. Diagrams use
[Mermaid](https://mermaid.js.org/) and render inline on GitHub.

## Start here

| Guide                                   | What it covers                                 |
|-----------------------------------------|------------------------------------------------|
| [Getting Started](./getting-started.md) | Install, build, load unpacked, first use       |
| [Architecture](./architecture.md)       | MV3 surfaces, modules, and the message catalog |

## Workflows (sequence diagrams)

| Guide                                           | Flow                                                       |
|-------------------------------------------------|------------------------------------------------------------|
| [Collection Pipeline](./collection-pipeline.md) | How a page's media is discovered and upgraded to originals |
| [Deep Scan](./deep-scan.md)                     | Opt-in auto-scroll that surfaces virtualized / lazy media  |
| [Download](./download.md)                       | How selected media is named and saved                      |
| [Download paths](./download-paths.md)           | Per-site folder templates ({host}/{domain}/{date}/{kind})  |
| [Favourites](./favourites.md)                   | The saved-media list and how it persists                   |
| [Badge](./badge.md)                             | The per-tab count on the toolbar icon                      |
| [In-page Bubble](./bubble.md)                   | The injected floating launcher and its lifecycle           |

## The three surfaces at a glance

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

- **Passive collection is network-free.** Metadata is derived from the DOM and
  URL strings only — no `fetch`/HEAD/preload while scanning. The only network
  call is lazy image size enrichment (`HEAD`), popup-only and user-initiated.
- **Deep scan issues no requests of its own** — it scrolls and re-reads the DOM;
  the page loads its own media.
- **Conservative URL upgrading.** Only safe path-based CDN rewrites; signed hosts
  (`fbcdn.net`, `preview.redd.it`) are left byte-identical; every upgrade keeps
  the pre-upgrade URL as a `thumbnailSrc` fallback.
