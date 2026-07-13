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
    └── extension/  (@mbd/extension)  # THE WXT app — all entrypoints, background/popup/content glue, UI,
                                      # active-tab messaging, and (future) platform implementations
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

## Known limitation — package coverage attribution

`yarn test` runs the whole suite in one app-scoped Vitest pass (merged coverage), but because
the package source resolves through the `node_modules/@mbd/*` symlink, Vitest's v8 provider
treats it as `node_modules` and **omits it from the coverage report** — the tests still exercise
that code, but the reported `%` reflects app glue only. There are no coverage thresholds, so
nothing fails; the number is informational and must be read with this caveat.

The proper fix is a root Vitest `projects` config with a project per package whose `resolve.alias`
maps `@mbd/*` to the real `src/` path (taking the files out of `node_modules`) and its tests
co-located under `packages/*/tests`. This was deferred because co-location requires moving the
shared fixtures and repairing three styles of fixture path reference (relative import,
`__dirname`-relative, and CWD-relative string reads) — churn best done as its own change rather
than folded into the structural migration.

## Follow-ups

1. **Package coverage attribution** — Vitest `projects` + per-package `resolve.alias` +
   co-located tests + fixtures (see above).
2. **Safari enablement (#307)** — implement `apps/extension/src/extension/platform/safari/*`
   behind the `@mbd/platform` contracts (anchor-blob `Downloader`, no-op `Notifier`/`HeaderRules`,
   page-context `StreamCaptureHost`); add `apps/safari-native/` Xcode wrapper over `.output/safari-mv3`;
   gate on the #307 Phase 0 spike.
3. **Wire the capability seam** — the background currently calls `chrome.*` directly; route it
   through the `@mbd/platform` interfaces + `selectPlatform()` so degraded targets fall back cleanly.
4. **Dependency hygiene** — the app under-declares nothing critical, but a pass to confirm each
   package declares exactly what it imports would harden independent builds.
```
