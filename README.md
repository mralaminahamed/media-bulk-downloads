# Media Bulk Downloads

A Chrome (Manifest V3) extension that collects media on a web page — images
(`<img>`, `srcset`, `<picture>` sources, and CSS `background-image`) plus
direct-file video and audio (`<video>`/`<audio>` and their `<source>`s, with
poster frames) — then lets you preview, filter, and download it individually or
in bulk.

## Features

- **Complete collection** — walks `<img>`/`srcset`/`<picture>`/`<source>` and
  computed CSS backgrounds for images, and `<video>`/`<audio>`/`<source>` +
  video posters for media, resolving every source to an absolute URL. Streaming
  manifests (`.m3u8`/`.mpd`) and `blob:` sources are skipped — they can't be
  fetched as a single file.
- **Media-kind filtering** — a primary All / Images / Video / Audio control with
  format chips that adapt to the kind (image formats, or MP4/WebM/OGG/MOV, or
  MP3/WAV/OGG/M4A/FLAC), plus minimum pixel size, minimum file size, and base64
  inclusion for images.
- **Per-kind grid & preview** — video tiles show their poster with a play badge
  (or a film-icon tile); audio shows an icon tile; the preview modal opens a real
  `<video>`/`<audio>` player, with prev/next and keyboard paging.
- **Bulk & single download** via the `chrome.downloads` API, with a configurable
  filename prefix and subfolder, and the correct file extension picked per media
  kind.
- **Toolbar badge** showing the eligible item count on each tab (toggleable).
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
| `downloads`       | Save selected media. |
| `storage`         | Persist user settings. |
| `tabs`            | Query the active tab and update the per-tab badge. |
| `<all_urls>` host | Read media from any page you run the extension on. |

**Media collection is network-free.** The content script never fetches media
bytes, so opening the popup or updating the badge does not silently issue
requests to every media URL on the page. Remote image file sizes are filled in
lazily, only from the popup (a user action, on the active tab) via
bounded-concurrency `HEAD` requests; base64 sizes are computed locally. Video
and audio load only when you press play in the preview.

## Project structure

```
src/
  manifest.json                 # MV3 manifest
  extension/
    background.ts               # service worker: badge, downloads, settings
    content.ts                  # collects media from the page (network-free)
    collect.ts                  # DOM scraping for images, video, audio + posters
    shared/imageUrl.ts          # image CDN-upgrade + type/dimension parsing
    shared/mediaType.ts         # video/audio type detection + skip list
    shared/filters.ts           # settings + toolbar filtering (badge + popup + download)
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

Covers image/video/audio collection and URL resolution, media type detection and
the skip list, the shared filter logic (settings + media-kind), background
filename/badge behavior, the concurrency-limited size fetcher, and the popup
components.
