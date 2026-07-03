# Media Bulk Downloads

A Chrome (Manifest V3) extension that finds every image, video, and audio file on
a page and lets you preview, filter, and bulk-download it — fast and private.

- **Finds more** — lazy `data-*` attrs, `srcset`, `<picture>`, CSS backgrounds,
  `<noscript>`, gallery `<a href>` links, and `<video>`/`<audio>` sources.
- **Upgrades to originals** — de-proxies wrapped URLs (Next.js, weserv, Cloudinary)
  and rewrites CDN thumbnails to full size (Twitter, Google, Pinterest, YouTube…).
- **Deep scan** — opt-in, bounded auto-scroll that surfaces virtualized and
  infinite-scroll media. Network-free: it only scrolls; the page loads its own media.
- **Filter & download** — by kind (image/video/audio), format, and size; save one
  or all with kind-correct extensions and a configurable subfolder.
- **On-page bubble** — an optional in-page panel in an isolated Shadow DOM.

## Quick start

Requires **Node 20+** and Corepack-enabled **Yarn**.

```bash
corepack enable
yarn install
yarn dev        # builds to dist/ and watches
```

Load it: `chrome://extensions` → **Developer mode** → **Load unpacked** → select
`dist/`. Production build: `yarn build`.

Full walkthrough → [Getting Started](./docs/guides/getting-started.md).

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

All guides use Mermaid diagrams that render inline on GitHub. Index:
[docs/guides](./docs/guides/README.md).

## Stack

Chrome MV3 · React 19 + TypeScript · Tailwind v4 · Vite 8 + `@crxjs/vite-plugin` ·
Jest + Testing Library.

```bash
yarn type-check && yarn lint && yarn test && yarn build
```

## Privacy

Collection is network-free — no media bytes are fetched while scanning. The only
network call is lazy image-size enrichment (`HEAD`), popup-only and
user-initiated; video/audio are never probed. Details in
[Architecture](./docs/guides/architecture.md#privacy-stance).

## License

MIT © Al Amin Ahamed
