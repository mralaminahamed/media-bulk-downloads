# `packages/` — domain packages

Browser-agnostic domain logic, split out of the WXT app so it can be reasoned
about, tested, and (eventually) retargeted independently of any one browser's
glue. Each package is a yarn workspace (`workspaces: ["packages/*", "apps/*"]`).

| Package             | Path            | Responsibility                                                                                                                            | May import                                                 |
|---------------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| **`@mbd/core`**     | `core/src/`     | Pure domain logic: collection, resolvers, sniffers, `download/stream` (HLS/DASH), `net`. No DOM-app or extension glue, **no `chrome.*`**. | nothing from the other packages (deps: `fflate`, `mp4box`) |
| **`@mbd/storage`**  | `storage/src/`  | `chrome.storage` + IndexedDB wrappers: settings, history, favourites, excluded, download-queue, idb, sync, per-host.                      | `@mbd/core` only (+ `idb-keyval`)                          |
| **`@mbd/platform`** | `platform/src/` | Browser-capability seam: downloader / notifier / header-rules / stream-capture-host contracts + per-browser capability detection.         | nothing (standalone seam)                                  |

## The one rule

Import direction is one-way: **app → storage/platform → core**. Core is the leaf
and stays browser-agnostic — a helper that needs a browser API belongs in the app
or behind the `@mbd/platform` seam, never in core. A boundary leak fails review.

Cross-package imports use the package name (`@mbd/core/collection/canonical`,
`@mbd/storage/history`, `@mbd/platform`). Each package's tests live under its own
`tests/` (see `../tests/README.md`).

## More

- Design & rationale — `../docs/architecture/monorepo-restructure.md`
- Working in the repo — the `extension-dev` skill (`.claude/skills/extension-dev/`)
- Adding a resolver / a store — the `adding-a-resolver` / `storage-and-settings` skills
