# Media Bulk Downloads

> Bulk-download images, video & audio from any web page — smart filters, original quality, fast and private.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/mfbfanlkinmkpfhpmbpjcnhdfdgjognnn?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/media-bulk-downloads/mfbfanlkinmkpfhpmbpjcnhdfdgjognnn)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-yellow.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Test](https://github.com/mralaminahamed/media-bulk-downloads/actions/workflows/test.yml/badge.svg)](https://github.com/mralaminahamed/media-bulk-downloads/actions/workflows/test.yml)
[![Extension CI](https://github.com/mralaminahamed/media-bulk-downloads/actions/workflows/extension-ci.yml/badge.svg)](https://github.com/mralaminahamed/media-bulk-downloads/actions/workflows/extension-ci.yml)

<p align="center">
  <img src="./assets/screenshot.png" alt="Media Bulk Downloads" width="640">
</p>

---

## Why Media Bulk Downloads?

Browser "Save image as" only grabs one file at a time. **Media Bulk Downloads** scans the entire page, finds every image, video, and audio file — including lazy-loaded content, `<srcset>`, CSS backgrounds, and gallery links — then lets you preview, filter, and download them all in bulk.

---

## Features

### Find More

- Lazy-loaded images (`data-*` attributes, `data-src`, `data-lazy-src`)
- `srcset` / `<picture>` responsive sources
- CSS `background-image` URLs
- `<noscript>` fallback images
- Gallery `<a href>` links (Reddit, Wallhaven, etc.)
- `<video>` and `<audio>` sources

### Original Quality

- **De-proxy** wrapped URLs (Next.js `_next/image`, weserv, Cloudinary fetch)
- **CDN upgrade** thumbnails to full size (Twitter `name=orig`, YouTube `maxresdefault`, Pinterest `/originals/`, Google `=s0`, and more)
- **Deep scan** — opt-in bounded auto-scroll that surfaces virtualized and infinite-scroll media (network-free: it only scrolls; the page loads its own media)
- **Resolve originals** — optional setting that fetches the exact highest-resolution file from supported hosts (off by default)

### Filter & Download

- Filter by **kind** (image / video / audio), **format** (jpg, png, gif, webp, mp4, webm, mp3…), and **size**
- Download **one item** or the **entire filtered set**
- Kind-correct file extensions (no `.jpg` on a `.png`)
- Configurable download subfolder and naming scheme
- **Download history** — open file, reveal in folder, or re-download with one click

### Private by Design

- **Network-free by default** — only reads what the page already loaded
- No accounts, no analytics, no servers — everything runs locally
- Settings and history never leave your device
- See [PRIVACY.md](./PRIVACY.md) for the full policy

---

## Install from Chrome Web Store

[**Install Media Bulk Downloads**](https://chromewebstore.google.com/detail/media-bulk-downloads/mfbfanlkinmkpfhpmbpjcnhdfdgjognnn) from the Chrome Web Store — one click, no account required.

---

## Install from Source (Development)

Requires **Node 20+** and Yarn.

```bash
git clone https://github.com/mralaminahamed/media-bulk-downloads.git
cd media-bulk-downloads
corepack enable
yarn install
yarn dev        # builds to dist/ and watches for changes
```

Then load the extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

Production build: `yarn build` (outputs `release/media-bulk-downloads-<version>.zip`).

---

## Install on Firefox

The extension also works on Firefox (Manifest V3, requires Firefox 109+).

```bash
yarn build:firefox    # builds Chrome dist, then adapts for Firefox → dist-firefox/
```

To load in Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select any file inside `dist-firefox/` (e.g. `manifest.json`)

To lint the Firefox build: `yarn lint:firefox`

---

## Usage

1. **Click the extension icon** on any page — the popup opens and scans for media
2. **Browse the grid** — hover to preview, click to open the full-size version
3. **Filter** by kind (image/video/audio), format, or file size
4. **Download** one item (click it) or all filtered items (click "Download all")
5. **Deep scan** (optional) — click the scroll icon to auto-scroll and find more media on infinite-scroll pages

An optional **on-page bubble** gives you the same tools in a draggable panel without opening the toolbar popup.

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `downloads` | Save selected media to your computer via Chrome's download manager |
| `downloads.open` | Open a downloaded file directly from the extension's history |
| `storage` | Store your preferences and download history locally on your device |
| `tabs` | Read the active tab's URL to label downloads with their source page |
| `<all_urls>` | Read media elements on whatever page you choose to use the extension on |

---

## Supported Sites (Highlights)

The collection engine works on **any website**. It includes dedicated upgrade rules for:

| Site | Upgrade |
|---|---|
| Wikipedia / Wikimedia | `/thumb/` path → original file |
| YouTube | Thumbnails → `maxresdefault`, avatars → full size |
| Twitter / X | `name=orig` for all photos, video poster recognition |
| Reddit | Gallery `<a href>` → direct `i.redd.it` original |
| Unsplash | Strip resize params → native-format master |
| Pinterest | `/NNNx/` → `/originals/` |
| Shopify stores | Drop `?width=` size queries |
| Google (Photos, Blogger) | `=s88-...` → `=s0` |
| Next.js / Vercel | De-proxy `/_next/image?url=` |
| Wallhaven | PNG/GIF badge detection → correct extension |

...and 40+ more CDN families. See the full [coverage benchmark](./docs/BENCHMARK.md).

---

## Tech Stack

- **Chrome & Firefox** — Manifest V3, cross-browser compatible
- **React 19** + **TypeScript** — type-safe UI
- **Tailwind CSS v4** — utility-first styling
- **Vite 8** + **@crxjs/vite-plugin** — fast builds with HMR
- **Jest** + **Testing Library** — unit and integration tests
- **web-ext** — Firefox build validation

---

## Project Structure

```
media-bulk-downloads/
├── src/
│   ├── extension/        # Service worker, content script, background
│   │   ├── collect.ts    # Media collection pipeline
│   │   ├── extract.ts    # DOM extraction (srcset, picture, noscript…)
│   │   ├── imageUrl.ts   # URL rewriting & CDN upgrades
│   │   └── resolvers/    # Per-platform native resolvers
│   ├── images/           # React UI components (popup, bubble, settings)
│   ├── styles/           # Tailwind entry + global styles
│   └── types/            # Shared TypeScript types
├── assets/               # Icons and screenshots
├── docs/                 # Guides, benchmarks, Chrome Web Store package
├── tests/                # Jest test suites
└── dist/                 # Build output (load unpacked)
```

---

## Documentation

| Guide | |
|-------|--|
| [Getting Started](./docs/guides/getting-started.md) | Install, build, load unpacked, first use |
| [Architecture](./docs/guides/architecture.md) | Surfaces, modules, message catalog, data model |
| [Collection Pipeline](./docs/guides/collection-pipeline.md) | Discovery + de-proxy → CDN-upgrade → dedup |
| [Deep Scan](./docs/guides/deep-scan.md) | The opt-in auto-scroll workflow and its bounds |
| [Download](./docs/guides/download.md) | Filename construction and save flow |
| [Badge](./docs/guides/badge.md) | The per-tab count on the toolbar icon |
| [In-page Bubble](./docs/guides/bubble.md) | The Shadow-DOM launcher lifecycle |

A live functional benchmark against top sites: [BENCHMARK.md](./docs/BENCHMARK.md).

---

## Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) before submitting a PR.

```bash
yarn type-check && yarn lint && yarn test && yarn build
```

---

## Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md).

---

## License

[MIT](./LICENSE) &copy; Al Amin Ahamed
