# @mbd/desktop

Desktop build of Media Bulk Downloads (Deno desktop). Requires Deno 2.9+.

- `deno task check` — type-check
- `deno task test` — unit tests
- `deno task build:collector` — bundle the injectable collector IIFE
- `deno task dev` — run the desktop app in dev
- `deno task build` — compile a binary

Reuses `@mbd/core` from the monorepo. See
`docs/superpowers/specs/2026-07-23-desktop-app-deno-design.md`.
