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

`yarn dev` builds `.output/chrome-mv3`, opens a browser with the extension loaded,
and auto-reloads on change. To load a build manually:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select `.output/chrome-mv3`.

## Build & package

```bash
yarn build          # wxt build → .output/chrome-mv3
yarn build:all      # chrome + firefox + edge
yarn zip:all        # store-ready zips in .output/
```

See the per-store upload matrix in the [README](../../README.md#build--package-chrome--firefox--edge).

## Quality gates

```bash
yarn type-check   # wxt prepare + tsc --noEmit
yarn lint         # eslint (flat config)
yarn test         # jest + Testing Library (jsdom), with coverage
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
2. **Filter** by kind (All / Images / Video / Audio), format, size bucket, or
   minimum size.
3. **Deep scan** (the ⇊ button) scrolls the page to surface virtualized or
   lazy-loaded media — useful on infinite feeds and galleries. See
   [Deep Scan](./deep-scan.md).
4. **Download** a single item (hover → ⬇) or everything shown (footer button).

## Settings

Persisted with `chrome.storage.sync`:

- **Downloads** — subfolder inside `Downloads/`, filename mode
  (original name vs. sequential prefix), "Ask where to save each file".
- **Filtering** — minimum image size, exclude base64.
- **Panel** — popup size; on-page bubble enable, position, panel placement, size.

## Where things live

```
wxt.config.ts                   # WXT build config (manifest fn, targets, zip)
src/
  entrypoints/                  # WXT entrypoints (background, content, popup) → wrap extension/
  public/icon/                  # extension icons
  extension/
    background.ts               # service worker: badge, downloads, settings, icon click
    content.ts                  # content-script logic: GET_IMAGES, DEEP_SCAN, bubble mount
    collect.ts                  # collectMedia(): DOM -> MediaItem[]
    content/deepScanRunner.ts   # real-DOM deep-scan bindings
    shared/
      imageUrl.ts               # de-proxy + CDN upgrade rules + type/dim parsing
      extract.ts                # lazy attrs, srcset, noscript, gallery links
      mediaType.ts              # video/audio type detection + skip list
      deepScan.ts               # pure bounded deep-scan loop
      filters.ts                # settings + toolbar filtering
      deep-scan-active-tab.ts   # popup deep-scan client
    popup/                      # popup React app (App, ImageList, FilterToolbar, Settings)
    bubble/                     # in-page bubble (React in Shadow DOM)
  styles/index.css              # Tailwind v4 + design tokens
tests/                          # Jest specs mirroring src/
docs/guides/                    # you are here
```

Next: [Architecture](./architecture.md).
