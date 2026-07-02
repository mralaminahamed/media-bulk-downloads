# Image Bulk Downloads

A Chrome (Manifest V3) extension that collects every image on a web page —
`<img>`, `srcset`, `<picture>` sources, and CSS `background-image` — then lets you
preview, filter, and download them individually or in bulk.

## Features

- **Complete collection** — walks `<img>`/`srcset`/`<picture>`/`<source>` and
  computed CSS backgrounds, resolving every source to an absolute URL.
- **Bulk & single download** via the `chrome.downloads` API, with a configurable
  filename prefix and subfolder.
- **Filtering** by type (JPEG/PNG/GIF/SVG/WebP), minimum pixel size, minimum file
  size, and base64 inclusion.
- **Toolbar badge** showing the eligible image count on each tab (toggleable).
- **Settings** for download path, filename prefix, popup size, minimum image
  size, and base64 exclusion — persisted with `chrome.storage.sync`.
- **On-page bubble (opt-in)** — a draggable floating launcher injected into the
  page that opens the full app in-place via an isolated Shadow DOM, for a native
  feel. Enable it in Settings and pick a corner. The toolbar popup keeps working
  as a full fallback (it always opens, including on `chrome://`, the Web Store,
  and PDF pages where content scripts can't run).

## Tech stack

| Area        | Choice |
|-------------|--------|
| Platform    | Chrome Manifest V3 (service worker + content script + popup) |
| UI          | React 19 + TypeScript |
| Styling     | Tailwind CSS v4 (`@tailwindcss/postcss`) |
| Build       | Vite 8 + `@crxjs/vite-plugin` v2 |
| Tests       | Jest + Testing Library (jsdom) |
| Lint        | ESLint 10 (flat config) + typescript-eslint |

## Getting started

Requires **Node 20+** and Corepack-enabled **Yarn**.

```bash
corepack enable
yarn install
```

### Develop

```bash
yarn dev
```

Then load the extension unpacked:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder (created by `yarn dev`
   or `yarn build`).

### Build

```bash
yarn build
```

Outputs a production, unpacked extension to `dist/` (this is the folder you load
into Chrome, or zip for the Web Store).

## Scripts

| Command            | Description |
|--------------------|-------------|
| `yarn dev`         | Vite dev server with HMR |
| `yarn build`       | Type-check then production build to `dist/` |
| `yarn lint`        | ESLint (flat config) |
| `yarn type-check`  | `tsc --noEmit` |
| `yarn test`        | Jest with coverage |
| `yarn test:watch`  | Jest in watch mode |

## Permissions & privacy

The extension requests only what it needs:

| Permission        | Why |
|-------------------|-----|
| `downloads`       | Save selected images. |
| `storage`         | Persist user settings. |
| `tabs`            | Query the active tab and update the per-tab badge. |
| `<all_urls>` host | Read images from any page you run the extension on. |

**Image collection is network-free.** The content script never fetches image
bytes, so opening the popup or updating the badge does not silently issue
requests to every image URL on the page. Remote file sizes are filled in lazily,
only from the popup (a user action, on the active tab) via bounded-concurrency
`HEAD` requests; base64 sizes are computed locally.

## Project structure

```
src/
  manifest.json                 # MV3 manifest
  extension/
    background.ts               # service worker: badge, downloads, settings
    content.ts                  # collects images from the page (network-free)
    shared/filters.ts           # settings-based filtering (badge + popup + download)
    popup/
      index.tsx                 # popup entry
      App.tsx                   # popup app + lazy size enrichment
      components/               # ImageList, FilterToolbar, Settings
      utils.ts                  # HEAD size fetch + concurrency limiter
  styles/index.css              # Tailwind v4 entry
tests/                          # Jest + Testing Library specs
```

## How filtering stays consistent

`src/extension/shared/filters.ts` is the single source of truth for
settings-based eligibility (minimum size + base64 exclusion). The background
worker (badge count), the popup (visible list), and the download handler all use
it, so the number on the badge matches what the popup shows and what gets
downloaded. Images with unknown intrinsic dimensions (srcset candidates, CSS
backgrounds) are never dropped by the size rule.

## Testing

```bash
yarn test
```

Covers image collection and URL resolution, the shared filter logic, background
filename/badge behavior, the concurrency-limited size fetcher, and the popup
components.
