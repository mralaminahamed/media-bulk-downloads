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
  `build:dashboard`) served by `Deno.serve` on `127.0.0.1:<random>`. It talks to
  the backend over `fetch('/api/…')` + an SSE `/events` stream (a per-session
  token, minted at startup and passed in the URL, guards every `/api`/`/events`
  request). Shows the media grid, multi-select, preview, download-to-queue, live
  queue status, and History/Favourites tabs. Closing it exits the app.
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
