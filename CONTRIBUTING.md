# Contributing

Thanks for your interest in Media Bulk Downloads. This guide covers local setup,
the checks your change must pass, and how work is proposed.

## Prerequisites

- **Node 20.19+** (`.nvmrc` pins 22 for development)
- **Corepack-enabled Yarn** — this repo pins Yarn via Corepack. Do not use npm.

```bash
corepack enable
yarn install
```

The build is powered by [WXT](https://wxt.dev), which targets Chrome, Firefox,
and Edge from one codebase.

## Develop

```bash
yarn dev            # Chrome: builds apps/extension/.output/chrome-mv3 and watches (auto-reloads)
# yarn dev:firefox  # Firefox dev profile
```

`yarn dev` opens a browser with the extension loaded. To load a build manually:
`chrome://extensions` → **Developer mode** → **Load unpacked** → select
`apps/extension/.output/chrome-mv3`.

## Checks (must pass before a PR)

Run the same gate CI runs:

```bash
yarn type-check   # tsc -b packages/* (composite) + app wxt prepare + tsc --noEmit
yarn lint         # eslint (whole workspace)
yarn test         # vitest + coverage
yarn build        # wxt build → apps/extension/.output/chrome-mv3
```

## Tests

This project is test-driven. New behavior needs a test; bug fixes start with a
failing test that the fix makes pass. Tests live under `apps/extension/tests/`
(`unit/` mirrors the source tree; `e2e/` holds the Playwright suite).

## Proposing a change

1. Branch off `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
2. Keep the change focused. Match the surrounding code's style and comment density.
3. Make sure all four checks above pass.
4. Open a PR describing **what** changed and **why**, and how you verified it.

## Reporting bugs / requesting features

Use the issue templates. For security issues, do **not** open a public issue —
see [SECURITY.md](./SECURITY.md).
