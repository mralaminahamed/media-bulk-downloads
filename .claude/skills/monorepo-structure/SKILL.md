---
name: monorepo-structure
description: Where code lives in this yarn-workspaces monorepo and the import boundaries between its packages. Use when adding a new file/module, deciding which package a piece of logic belongs in, wiring a browser API, resolving an import that "can't find" a moved module, or reasoning about why @mbd/core must stay browser-agnostic. Read this before creating a file under packages/ or apps/.
---

# Monorepo structure & import boundaries

This repo is a yarn-workspaces monorepo (`workspaces: ["packages/*", "apps/*"]`).
It was split from a single WXT app so browser-agnostic domain logic is packaged
independently of browser-divergent glue — the seam that makes a degraded Safari
target (or any future target) a matter of supplying one folder of implementations
(#307). Full rationale: `docs/architecture/monorepo-restructure.md`.

## The four workspaces

| Package          | Path                     | What lives here                                                                                                                                                         | May import                                              |
|------------------|--------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| `@mbd/core`      | `packages/core/src/`     | PURE domain logic: collection, resolvers, sniffers, `download/stream` (HLS/DASH), `net`. No DOM-app or browser-extension glue.                                          | nothing from the other three (deps: `fflate`, `mp4box`) |
| `@mbd/storage`   | `packages/storage/src/`  | `chrome.storage` + IndexedDB wrappers: settings, history, favourites, excluded, download-queue (the reducer/model), idb, sync, per-host.                                | `@mbd/core` only (+ `idb-keyval`)                       |
| `@mbd/platform`  | `packages/platform/src/` | Browser-capability seam: downloader / notifier / header-rules / stream-capture-host contracts + per-browser capability detection.                                       | nothing (standalone seam)                               |
| `@mbd/extension` | `apps/extension/src/`    | The WXT app: `entrypoints/` (background, content scripts, MAIN-world sniffers, offscreen), `extension/{background,content,popup,bubble,offscreen}`. Imports everything. | `@mbd/core`, `@mbd/storage`, `@mbd/platform`            |

Import direction is one-way: **app → storage/platform → core**. Core is the leaf.

## The rules (do not break these)

1. **`@mbd/core` is browser-agnostic — never call `chrome.*` in it.** It has zero
   `chrome.*` calls today (the string appears only in doc comments describing what
   `chrome.downloads` can't do). A resolver/collector/stream helper that needs a
   browser API belongs in the app or behind the `@mbd/platform` seam, not in core.
2. **`@mbd/core` imports none of the other packages.** Not storage, not platform,
   not the app. If core seems to need storage/app data, pass it in as an argument
   or a dependency object (the `*Deps` pattern used throughout `download/stream`).
3. **`@mbd/storage` may import `@mbd/core`, never the reverse**, and never the app.
4. **`@mbd/platform` imports nothing** from the workspace — it defines the
   capability contracts the app implements per browser.
5. **Only `@mbd/extension` may touch `chrome.*` freely** (plus `@mbd/storage` for
   its storage/idb wrappers). Anything else is a boundary leak.

## Where does a new file go?

- A URL rewrite / resolver / sniffer parser / stream (de)mux helper, DOM-free and
  chrome-free → `packages/core/src/{collection,resolvers,download,net}/`.
- A new persisted store or a settings field → `packages/storage/src/`.
- A new browser capability contract (or a Safari/Firefox-divergent behaviour) →
  `packages/platform/src/`, implemented in the app.
- A content script, background handler, popup component, offscreen glue → under
  `apps/extension/src/`.

## Imports & aliases

- Cross-package imports use the package name: `@mbd/core/collection/canonical`,
  `@mbd/storage/history`, `@mbd/platform`.
- Inside the app, `@/` → `apps/extension/src` (WXT plugin).
- Tests mirror each package's `src/` under its own `tests/`
  (`packages/core/tests/…`, `apps/extension/tests/unit/…`); root `vitest.config.ts`
  runs them as separate projects. See `testing-and-verifying`.

## Common mistakes

- Putting a resolver or a collection helper under `apps/extension` because "that's
  where the old `src/extension/shared/` was" — it now lives in `packages/core`.
- Reaching for `chrome.storage` inside a core module — thread the value in instead,
  or move the code to storage/app.
- Importing `@mbd/storage` (or `@/…`) from a core file — that's the boundary the
  restructure exists to enforce; it will (and should) fail review.

## References

- Design & outcome — `docs/architecture/monorepo-restructure.md`
- Package manifests — `packages/{core,storage,platform}/package.json`, `apps/extension/package.json`
- Related skills — `extension-dev` (build/dev/zip), `adding-a-resolver` (core resolvers),
  `storage-and-settings` (the storage package), `testing-and-verifying` (per-package tests)
