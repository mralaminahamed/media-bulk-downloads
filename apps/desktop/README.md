<p align="center">
  <img src="assets/icon-256.png" width="120" height="120" alt="Media Bulk Downloads" />
</p>

<h1 align="center">@mbd/desktop</h1>

Desktop build of Media Bulk Downloads (Deno desktop). Requires Deno 2.9+.

- `deno task check` — type-check
- `deno task test` — unit tests
- `deno task build:collector` — bundle the injectable collector IIFE
- `deno task build:icons` — regenerate the app icons from `assets/icon.svg`
- `deno task dev` — run the desktop app in dev
- `deno task build` — compile the `.app` (embeds `assets/icon.icns`)

## Assets

`assets/icon.svg` is the master brand mark (shared with the browser extension).
`deno task build:icons` renders every platform artifact from it —
`icon.icns` (macOS), `icon.ico` (Windows), `icon.png`/`icon-256.png` (Linux /
docs). Edit the SVG only; the rasters are generated. Requires `rsvg-convert`,
`magick`, and (macOS) `iconutil`.

Reuses `@mbd/core` from the monorepo. See
`docs/superpowers/specs/2026-07-23-desktop-app-deno-design.md`.
