# Getting Started

## Prerequisites

- **Node 20.19+** (`.nvmrc` pins 22)
- **Corepack-enabled Yarn** (the repo pins Yarn via `packageManager`)
- A Chromium browser (Chrome/Edge) and/or Firefox 109+

```bash
corepack enable
yarn install
```

> All scripts use Corepack Yarn. Do not use npm. The build is powered by
> [WXT](https://wxt.dev), which targets Chrome, Firefox, and Edge from one codebase.

## Develop

```bash
yarn dev            # Chrome
# yarn dev:firefox  # Firefox
```

`yarn dev` builds `apps/extension/.output/chrome-mv3`, opens a browser with the extension loaded,
and auto-reloads on change. To load a build manually:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3`.

## Build & package

```bash
yarn build          # wxt build → apps/extension/.output/chrome-mv3
yarn build:all      # chrome + firefox + edge
yarn zip:all        # store-ready zips in apps/extension/.output/
```

See the per-store upload matrix in the [README](../../README.md#build--package).

## Quality gates

```bash
yarn type-check   # tsc -b packages/* (composite) + app wxt prepare + tsc --noEmit
yarn lint         # eslint (flat config)
yarn test         # vitest + Testing Library (jsdom), with coverage
yarn build        # production build
```

## First use

The toolbar icon behaves in one of two ways depending on your settings:

- **Popup mode (default):** clicking the icon opens the popup panel.
- **Bubble mode:** clicking the icon toggles an in-page floating panel (enable
  **Show on-page bubble** in Settings). See [In-page Bubble](./bubble.md).

Once open:

1. The panel **scans the active tab** and shows every image, video, and audio
   file it found. The toolbar badge shows the eligible count per tab.
2. **Filter** by kind (All / Images / Video / Audio), format, size bucket,
   minimum size, or whether to include Base64 (inline `data:`) images.
3. **Deep scan** (the ⇊ button) scrolls the page to surface virtualized or
   lazy-loaded media — useful on infinite feeds and galleries. See
   [Deep Scan](./deep-scan.md).
4. **Download** a single item (hover → ⬇) or everything shown (footer button).
5. **Download History** and **Favourites** are one click away from the popup
   header — see [Download History](./history.md) and [Favourites](./favourites.md).

## Settings

Persisted with `chrome.storage.sync`:

- **Downloads** — subfolder inside `Downloads/`, filename mode
  (original name vs. sequential prefix), "Ask where to save each file".
- **Collection** — minimum image size, exclude base64, and **"Resolve exact
  originals"** (off by default) — an opt-in toggle that lets the background
  fetch a hinted item's exact original from one of 9 supported hosts
  (Twitter/X, Wallhaven, Unsplash, Vimeo, Bluesky, Pinterest, Reddit, Flickr,
  ArtStation). See [Resolve Originals](./resolve-originals.md).
- **Deep scan** — max items (50–5000), max time (5–120 s), max scroll steps
  (5–200), and **"Click 'Load more' buttons"** (off by default). These override
  the built-in defaults per scan. See [Deep Scan](./deep-scan.md).
- **Appearance** — thumbnail size, preview size, and **"Show image count on
  icon"** (toolbar badge toggle).
- **Panel** — popup size; on-page bubble enable, position, panel placement, size.

## Where things live

The repo is a yarn-workspaces monorepo: browser-agnostic logic in `packages/*`,
the WXT app in `apps/extension`. See [Architecture → Workspace layout](./architecture.md#workspace-layout).

```
package.json                    # workspaces root: [packages/*, apps/*] + orchestration scripts
tsconfig.base.json              # shared compiler options for the packages

packages/
  core/            @mbd/core    # browser-agnostic domain logic (zero chrome.*)
    src/
      collection/               #   extract · imageUrl · mediaType · deepScan · filters ·
                                 #     paths · download-name (buildDownloadFilename)
      resolvers/                #   collection-time REGISTRY + opt-in network resolve:
        index.ts                 #     REGISTRY + resolve() dispatch
        network.ts               #     opt-in fetch() dispatch (9 platforms)
        sites/                   #     per-host resolvers (+ vimeo.ts id-extraction only)
        sniffers/                #     response/hls/ig/x/fb/pinterest MAIN-world sniffers
      download/                 #   zip · base64 · convert/ · stream/ (HLS/DASH byte-logic)
      net/                      #   fetch retry
      types.ts                  #   shared TypeScript types (ChromeMessage, ImageInfo, …)
  storage/         @mbd/storage # persistence over chrome.storage + IndexedDB:
                                 #   settings · history · favourites · excluded · queue ·
                                 #   per-host memory · backup · sync
  platform/        @mbd/platform# capability contracts (Downloader/Notifier/HeaderRules/
                                 #   StreamCaptureHost) + detectCapabilities()

apps/
  extension/       @mbd/extension
    wxt.config.ts               # WXT build config (manifest fn, targets, zip)
    src/
      entrypoints/              # background · content · ig/x/fb/pinterest/hls MAIN-world
                                 #   sniffers · offscreen (HLS/DASH capture) · popup
      public/icon/              # extension icons
      types/                    # ambient CSS-module declarations
      extension/
        background/             # MV3 service worker (badge, commands, context-menu,
                                 #   message-router, state, download/ queue+capture)
        content/               # collect.ts (DOM → MediaItem[]) · deepScanRunner · bubble mount
        components/BrandMark.tsx
        shared/active-tab/     # popup↔content bridges: collect / deep-scan /
                                 #   resolve-originals / capture-stream
        popup/                 # React popup: App.tsx, components/panels/, hooks/
        bubble/                # in-page bubble (Shadow DOM host + React root)
      styles/index.css          # Tailwind v4 + design tokens
    tests/unit/                 # Vitest specs
    tests/e2e/                  # Playwright e2e (real extension in Chromium)

docs/guides/                    # you are here
docs/architecture/              # monorepo-restructure design record
```

Next: [Architecture](./architecture.md).
