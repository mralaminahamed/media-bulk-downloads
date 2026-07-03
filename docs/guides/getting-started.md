# Getting Started

## Prerequisites

- **Node 20.19+**
- **Corepack-enabled Yarn** (the repo pins `yarn@4.17.0` via `packageManager`)
- Google Chrome (Manifest V3)

```bash
corepack enable
yarn install
```

> All scripts use Corepack Yarn. Do not use npm.

## Develop

```bash
yarn dev
```

Vite builds an unpacked extension to `dist/` and rebuilds on change. Load it once:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the project's `dist/` folder.
4. After editing, Vite rewrites `dist/`; click the reload ↻ on the extension card
   to pick up service-worker / manifest changes (popup/content HMR is automatic).

## Build

```bash
yarn build      # tsc --noEmit, then a production build to dist/
```

`dist/` is the folder you load into Chrome or zip for the Web Store.

## Quality gates

```bash
yarn type-check   # tsc --noEmit
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
src/
  manifest.config.ts            # typed MV3 manifest (crxjs emits dist/manifest.json)
  extension/
    background.ts               # service worker: badge, downloads, settings, icon click
    content.ts                  # content-script entry: GET_IMAGES, DEEP_SCAN, bubble mount
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
