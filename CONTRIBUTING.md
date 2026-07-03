# Contributing

Thanks for your interest in Media Bulk Downloads. This guide covers local setup,
the checks your change must pass, and how work is proposed.

## Prerequisites

- **Node 22** (see `.nvmrc`)
- **Corepack-enabled Yarn** — this repo pins Yarn via Corepack. Do not use npm.

```bash
corepack enable
yarn install
```

## Develop

```bash
yarn dev      # Vite build to dist/, watching for changes
```

Load it in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select `dist/`. Reload the extension after a rebuild.

## Checks (must pass before a PR)

Run the same gate CI runs:

```bash
yarn type-check   # tsc --noEmit
yarn lint         # eslint
yarn test         # jest + coverage
yarn build        # tsc + vite build, zips to release/
```

## Tests

This project is test-driven. New behavior needs a test; bug fixes start with a
failing test that the fix makes pass. Tests live under `tests/` mirroring `src/`.

## Proposing a change

1. Branch off `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
2. Keep the change focused. Match the surrounding code's style and comment density.
3. Make sure all four checks above pass.
4. Open a PR describing **what** changed and **why**, and how you verified it.

## Reporting bugs / requesting features

Use the issue templates. For security issues, do **not** open a public issue —
see [SECURITY.md](./SECURITY.md).
