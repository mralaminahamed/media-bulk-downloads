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

See the per-store upload matrix in the [README](../../README.md#build--package).

## Quality gates

```bash
yarn type-check   # wxt prepare + tsc --noEmit
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
  fetch a few supported hosts (Twitter/X, Wallhaven, Unsplash) for the exact
  original file. See [Resolve Originals](./resolve-originals.md).
- **Deep scan** — max items (50–5000), max time (5–120 s), max scroll steps
  (5–200), and **"Click 'Load more' buttons"** (off by default). These override
  the built-in defaults per scan. See [Deep Scan](./deep-scan.md).
- **Appearance** — thumbnail size, preview size, and **"Show image count on
  icon"** (toolbar badge toggle).
- **Panel** — popup size; on-page bubble enable, position, panel placement, size.

## Where things live

```
wxt.config.ts                   # WXT build config (manifest fn, targets, zip)
src/
  entrypoints/                  # WXT entrypoints (background, content, popup) → wrap extension/
  public/icon/                  # extension icons
  types/                        # shared TypeScript types
  extension/
    background/index.ts         # service worker: badge, downloads, settings, icon click
    content/index.ts            # content-script logic: GET_IMAGES, DEEP_SCAN, bubble mount
    content/collect.ts          # collectMedia(): DOM -> MediaItem[]
    content/deepScanRunner.ts   # real-DOM deep-scan bindings
    components/BrandMark.tsx    # shared icon mark (popup header + bubble launcher)
    shared/
      imageUrl.ts               # de-proxy + CDN upgrade rules + type/dim parsing
      extract.ts                # lazy attrs, srcset, noscript, gallery links
      mediaType.ts              # video/audio type detection + skip list
      deepScan.ts               # pure bounded deep-scan loop
      filters.ts                # settings + toolbar filtering
      settings.ts               # DEFAULT_SETTINGS + withDefaults()
      paths.ts                  # expandPathTemplate, sanitizePathSegment, domain/date helpers
      history.ts                # download-history storage (record / remove / clear)
      favourites.ts             # favourites storage (add / remove / clear)
      collect-active-tab.ts     # popup collect() client
      deep-scan-active-tab.ts   # popup deep-scan client
      resolve-originals-active.ts # popup RESOLVE_ORIGINALS client
      resolvers/                # opt-in "resolve exact originals" host resolvers:
                                 #   twitter.ts, unsplash.ts, wallhaven.ts, generic.ts,
                                 #   network.ts (dispatch + fetch), types.ts, index.ts
    popup/
      App.tsx                   # popup shell: grid, filters, header actions
      components/               # ImageList, FilterToolbar, Settings, HistoryPanel,
                                 #   FavouritesPanel
      hooks/useDialog.ts        # shared modal focus-trap/Escape hook
      utils.ts
    bubble/
      Bubble.tsx                # launcher + drag/resize + panel placement
      mount.tsx                 # Shadow DOM host + React root mount/unmount
  styles/index.css              # Tailwind v4 + design tokens
tests/unit/                     # Vitest specs mirroring src/
tests/e2e/                      # Playwright e2e (real extension in Chromium)
docs/guides/                    # you are here
```

Next: [Architecture](./architecture.md).
