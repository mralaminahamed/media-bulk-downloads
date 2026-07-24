<p align="center">
  <img src="assets/icon-256.png" width="120" height="120" alt="Media Bulk Downloads" />
</p>

<h1 align="center">@mbd/desktop</h1>

Desktop build of Media Bulk Downloads (Deno desktop). Requires Deno 2.9+.

- `deno task check` — type-check
- `deno task test` — unit tests
- `deno task build:collector` — bundle the injectable collector IIFE
- `deno task build:dashboard` — bundle the React dashboard into an embedded asset map
- `deno task build:icons` — regenerate the app icons from `assets/icon.svg`
- `deno task dev` — run the desktop app in dev
- `deno task build` — compile the `.app` (embeds `assets/icon.icns` + the dashboard)

## Architecture (two windows + a local backend)

The app runs one Deno process that opens two windows:

- **Dashboard window** — a React app (`dashboard/`, built by Vite → embedded via
  `build:dashboard`) styled to match the browser extension's popup: it reuses the
  extension's "precision utility" design system — the same tokens + component
  classes (`.btn`/`.field`/`.chip`/`.card`/`.eyebrow`/`.hairline`/`.dotgrid`/`.num`,
  copied as plain CSS into `dashboard/src/styles.css`; no Tailwind build), a
  dotgrid brand header, and OS-following dark mode. A URL bar is the first row
  under the header. Served by `Deno.serve` on `127.0.0.1:<random>`. It talks to
  the backend over `fetch('/api/…')` + an SSE `/events` stream (a per-session
  token, minted at startup and passed in the URL, guards every `/api`/`/events`
  request). Shows the media grid (with a filter toolbar — kind/format/size/search/
  sort, reusing `@mbd/core`'s filter predicates), multi-select, preview,
  download-to-queue, live queue status, History/Favourites tabs, and a Settings
  surface (Downloads/Media/Display/Data/Advanced panes on KV, incl. backup
  export/import). A "Deep scan" button runs a bounded injected scroll loop
  (reusing `@mbd/core`'s `runDeepScan`) to surface lazy-loaded media before
  collecting, with per-registrable-host scan memory that warm-starts repeats and
  a live progress indicator (SSE). HLS video items are badged and offer a
  "Capture" action — the Deno backend fetches + decrypts + muxes the stream to an
  `.mp4` (reusing `@mbd/core`'s `captureHls` + mp4box, run server-side so no
  offscreen document is needed), with `capture-progress` over SSE and a
  configurable quality. Settings changes take effect live — the queue + overlay
  read them without a restart. Closing it exits the app.
- **Browser window** — navigates external sites; a Shadow-DOM overlay injected via
  `executeJs` collects media (page → Deno over the `window.__mbdCmd` command
  queue, since `win.bind` can't resolve async handlers). Collected items flow into
  an in-memory store → SSE → the dashboard grid. Closing it hides it; the
  dashboard's "Show browser" button (or navigating it) brings it back.

Backend/server code is `src/server/*` (server, routes, media-store, sse); storage
is Deno KV (`src/storage/*`); the download queue + downloader are `src/platform/*`.

## Assets

`assets/icon.svg` is the master brand mark (shared with the browser extension).
`deno task build:icons` renders every platform artifact from it —
`icon.icns` (macOS), `icon.ico` (Windows), `icon.png`/`icon-256.png` (Linux /
docs). Edit the SVG only; the rasters are generated. Requires `rsvg-convert`,
`magick`, and (macOS) `iconutil`.

Reuses `@mbd/core` from the monorepo. Runtime gotchas + the two-window model are
documented in `docs/runtime-recipe.md`.

## Assets

`assets/icon.svg` is the master brand mark (shared with the browser extension).
`deno task build:icons` renders every platform artifact from it —
`icon.icns` (macOS), `icon.ico` (Windows), `icon.png`/`icon-256.png` (Linux /
docs). Edit the SVG only; the rasters are generated. Requires `rsvg-convert`,
`magick`, and (macOS) `iconutil`.

Reuses `@mbd/core` from the monorepo. See
`docs/superpowers/specs/2026-07-23-desktop-app-deno-design.md`.
