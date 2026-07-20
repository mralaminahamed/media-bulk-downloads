# Monorepo restructure — design & outcome

**Date:** 2026-07-13 · **Refs:** #307 (Safari support investigation)

## Context

Media Bulk Downloads shipped as a single WXT app (`srcDir: src`, one `package.json`,
Chrome/Edge/Opera/Firefox built via `wxt build -b <browser>`). Investigating Safari
support (#307) surfaced the need for a clean seam between browser-agnostic domain
logic and browser-divergent glue — Safari lacks `chrome.downloads`, `chrome.offscreen`,
and `chrome.notifications`. Rather than a lighter "capabilities layer only" change, we
converted the repository into a full `apps/` + `packages/` yarn-workspaces monorepo.

The payoff is an **enforced boundary**: the domain logic is now independently packaged
and the browser-capability contracts are explicit, which is what makes adding a
degraded Safari target (or any future target) a matter of supplying one folder of
implementations rather than threading `import.meta.env` branches through shared code.

## Final structure

```
media-bulk-downloads/                 # workspaces root (private)
├── package.json                      # workspaces: [packages/*, apps/*]; shared tooling + orchestration scripts
├── tsconfig.base.json                # shared composite-project compiler options
├── eslint.config.js                  # single flat config, location-agnostic globs
├── packages/
│   ├── core/       (@mbd/core)       # browser-AGNOSTIC: collection, resolvers, download byte-logic, net, types
│   ├── storage/    (@mbd/storage)    # persistence over chrome.storage + IndexedDB (Safari-safe API)
│   └── platform/   (@mbd/platform)   # capability CONTRACTS + feature detection (no implementations)
└── apps/
    ├── extension/  (@mbd/extension)  # THE WXT app — all entrypoints, background/popup/content glue, UI,
    │                                 # active-tab messaging, and the platform seam
    └── safari-native/                # Safari Xcode wrapper (macOS) over .output/safari-mv3 — see #307
```

**Dependency graph (acyclic):** `core` (leaf) ← `storage`, `platform` ← `apps/extension`.

## Package boundaries & rationale

A module lives in a **package** if it is pure/isomorphic (no `chrome`, no `import.meta.env`)
or touches only APIs present on every target including Safari (`chrome.storage`). It stays
in **apps/extension** if it touches a browser-divergent API (`chrome.downloads`/`offscreen`/
`notifications`/`declarativeNetRequest`), reads `import.meta.env`, is a WXT entrypoint, is
internal message-protocol glue, or is UI.

- **@mbd/core** holds the whole pure cluster as ONE package. `resolvers → collection`,
  `download → collection`, and `types ↔ collection/canonical` are real intra-module cycles
  (`resolvers/index.ts` builds its `REGISTRY` lazily specifically to survive a circular
  import). Splitting the cluster would turn tolerated intra-package cycles into illegal
  cross-package cycles, so it stays unified.
- **@mbd/storage** is separated only because its ambient `chrome.storage` dependency would
  otherwise poison core's "zero-globals, isomorphic" guarantee. It is *not* part of the
  Safari seam — `chrome.storage` exists on Safari.
- **@mbd/platform** is a dedicated contract package because Safari-enablement is the whole
  reason for the migration. Interfaces here (`Downloader`, `Notifier`, `HeaderRules`,
  `StreamCaptureHost`, `Capabilities`) make "interface in package, implementation in app"
  enforceable. `detectCapabilities()` is dependency-free feature detection (never UA sniffing).
- **active-tab** moved into the app (`apps/extension/src/extension/shared/active-tab`) — it
  drives the app's own `chrome.tabs`/`runtime` message contract, so it is glue, not library.

A prerequisite refactor moved two pure helpers (`getImageType`, `parseSrcset`) out of
`content/collect.ts` into `collection/imageUrl.ts`, breaking the only content→collection
back-edge that would have become an illegal core→app dependency.

## Resolution model

Source-first, not TypeScript path-mapping. Each package's `package.json` exposes its `src`
via `exports` (with `./*` subpath wildcards; only `@mbd/core/resolvers` needs a bare entry).
With `nodeLinker: node-modules`, yarn symlinks `node_modules/@mbd/* → packages/*`, and
TypeScript (`moduleResolution: Bundler`), Vite/WXT, and Vitest all resolve `@mbd/core/…` to
the `.ts` source through the symlink + `exports` — no prebuild, no `.d.ts` staging.

Type-checking builds the packages as composite projects (`tsc -b packages/core packages/storage
packages/platform`) then the app (`tsc --noEmit`). Packages emit declaration-only into a
gitignored `.tsbuild/`.

## Migration sequence (each step verified green)

0. Pull #308 (Pinterest sniffer). 1. Workspaces scaffold. 2. `tsconfig.base.json`.
3. Extract `@mbd/core` (56 files, 158 import sites). 4. Extract `@mbd/storage`.
5. Scaffold `@mbd/platform`. 6. Move the WXT app into `apps/extension` (293 renames);
split app-specific deps to the app, keep shared tooling at root; orchestration scripts.

Import rewrites were unambiguous prefix substitutions driven by an explicit directory map
(`@/extension/shared/{collection,resolvers,net,download}` → `@mbd/core/…`, relative
`../shared/…` crossings likewise), applied per extraction and gated on tsc + vitest + eslint.

## Verification

`yarn type-check` (packages composite build + app `--noEmit`), `yarn test` (2068 tests),
`yarn build:all` (Chrome/Firefox/Edge), `yarn lint`. All green throughout the migration.

## Testing & coverage

Each package owns its test suite under `packages/*/tests` and runs as its own Vitest project
whose `resolve.alias` maps `@mbd/<pkg>` to the real `src/` path (not the `node_modules/@mbd/*`
symlink), so v8 coverage **attributes the package source** instead of dropping it as node_modules.
`core` runs under jsdom with a Blob/scroll polyfill; `storage` under jsdom with a chrome.storage
mock + `fake-indexeddb`; `platform` under node. Shared setup lives in `tests/setup/`.

The root `vitest.config.ts` runs the three package projects with merged coverage. The WXT app
(`@mbd/extension`) keeps its own `WxtVitest` run — WxtVitest does not compose as a Vitest
sub-project (its `@/` alias resolves against the wrong cwd) — so the root `test` script chains
both: `vitest run --coverage && yarn workspace @mbd/extension test`. Fixture reads are
location-independent (HTML/m3u8 via vite `?raw` imports, binary via `__dirname`-relative reads),
and `tsconfig.test.json` type-checks the relocated package tests.

Result: package coverage is visible again (~96% statements across the package source), and each
package is independently testable.

## Follow-ups

1. ~~**Safari enablement (#307)**~~ — **done**: `platform/safari.ts` implements the `@mbd/platform`
   contracts (anchor-blob `Downloader`, no-op `Notifier`/`HeaderRules`, page-context
   `StreamCaptureHost`), and `apps/safari-native/` wraps `.output/safari-mv3` (submitted to the Mac
   App Store, under review). The planned `safari/*` directory landed as a single `safari.ts` module.
2. **Wire the capability seam** — the background currently calls `chrome.*` directly; route it
   through the `@mbd/platform` interfaces + `selectPlatform()` so degraded targets fall back cleanly.
3. **Dependency hygiene** — the app under-declares nothing critical, but a pass to confirm each
   package declares exactly what it imports would harden independent builds.
