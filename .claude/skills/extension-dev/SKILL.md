---
name: extension-dev
description: Develop in this WXT Manifest-V3 yarn-workspaces monorepo — where code lives and the package import boundaries, how to build/dev/zip/load for Chrome/Firefox/Edge, the MV3 pitfalls specific to this repo, how to debug the loaded extension at runtime, and the performance guardrails. Use when deciding which package a new file belongs in, wiring a browser API, resolving a moved-module import, working on entrypoints/manifest/background/content scripts, chasing a bug that reproduces only in the loaded build, or keeping the content script / popup / deep-scan fast.
---

# Extension development (WXT · MV3 · monorepo)

Built with **[WXT](https://wxt.dev)** from a yarn-workspaces monorepo
(`workspaces: ["packages/*", "apps/*"]`). Always **Corepack Yarn**, never npm.
Node **20.19+** (`.nvmrc` pins 22).

## Where code lives — the four workspaces

Split from a single WXT app so browser-agnostic domain logic is packaged apart
from browser-divergent glue (the seam that makes a new target — degraded Safari,
etc. — a matter of supplying one folder of implementations, #307). Full
rationale: `docs/architecture/monorepo-restructure.md`.

| Package | Path | What lives here | May import |
|---|---|---|---|
| `@mbd/core` | `packages/core/src/` | PURE domain logic: collection, resolvers, sniffers, `download/stream` (HLS/DASH), `net`. No DOM-app or extension glue. | nothing from the other three (deps: `fflate`, `mp4box`) |
| `@mbd/storage` | `packages/storage/src/` | `chrome.storage` + IndexedDB wrappers: settings, history, favourites, excluded, download-queue, idb, sync, per-host. | `@mbd/core` only (+ `idb-keyval`) |
| `@mbd/platform` | `packages/platform/src/` | Browser-capability seam: downloader / notifier / header-rules / stream-capture-host contracts + per-browser capability detection. | nothing (standalone seam) |
| `@mbd/extension` | `apps/extension/src/` | The WXT app: `entrypoints/` (background, content, MAIN-world sniffers, offscreen), `extension/{background,content,popup,bubble,offscreen}`. | all three |

Import direction is one-way: **app → storage/platform → core**. Core is the leaf.
The hard rules (a boundary leak fails review):

1. **`@mbd/core` is browser-agnostic — never `chrome.*` in it.** A resolver/
   collector/stream helper that needs a browser API belongs in the app or behind
   the `@mbd/platform` seam. If core seems to need storage/app data, pass it in as
   an argument or a `*Deps` object (the pattern throughout `download/stream`).
2. **`@mbd/core` imports none of the other packages.** Not storage, platform, app.
3. **`@mbd/storage` may import `@mbd/core`, never the reverse**, never the app.
4. **`@mbd/platform` imports nothing** from the workspace.
5. **Only `@mbd/extension` touches `chrome.*` freely** (+ `@mbd/storage` for its
   storage/idb wrappers).

**Where does a new file go?** DOM-free, chrome-free URL rewrite / resolver /
sniffer parser / stream (de)mux → `packages/core`. A persisted store or settings
field → `packages/storage`. A browser-capability contract or divergent behaviour
→ `packages/platform`. A content script / background handler / popup component /
offscreen glue → `apps/extension`. Common mistake: dropping a resolver under
`apps/extension` because "that's where old `src/extension/shared/` was" — it now
lives in `packages/core`.

Imports use the package name (`@mbd/core/collection/canonical`,
`@mbd/storage/history`, `@mbd/platform`); inside the app `@/` → `apps/extension/src`.

## Commands

```bash
yarn dev            # Chrome dev (HMR) → apps/extension/.output/chrome-mv3
yarn dev:firefox    # Firefox dev profile
yarn build          # apps/extension/.output/chrome-mv3   (also :firefox, :edge, :all)
yarn zip            # store zip in apps/extension/.output/ (also :firefox, :edge, :all)
yarn type-check     # wxt prepare + tsc --noEmit   ← run before trusting tsc
yarn lint           # eslint
yarn test           # vitest + coverage
```

Zips: `apps/extension/.output/media-bulk-downloads-<version>-<browser>.zip`
(Firefox also emits `-sources.zip` for AMO). Version from `package.json`. Load
unpacked: `apps/extension/.output/chrome-mv3` (or `firefox-mv3`). No `dist/`/`release/`.

## Manifest & entrypoints

- `apps/extension/wxt.config.ts` — `srcDir: 'src'`, `publicDir: 'src/public'`,
  `manifestVersion: 3` (Firefox too), `imports: false` (explicit imports + the
  `chrome.*` namespace), React via `@wxt-dev/module-react`, Tailwind via
  `postcss.config.js`. The manifest is a **function of `browser`** — Firefox gets
  `browser_specific_settings.gecko`. Permissions live here; see `releasing` for
  the full permission table + justifications.
- `apps/extension/src/entrypoints/{background,content,popup}` — thin WXT wrappers
  that side-effect-import the real modules under `apps/extension/src/extension/`.
- Tailwind imported with a **prefix** — every utility is `mbd:…` (see
  `ui-design-system`). A bare utility is a silent no-op.

## MV3 pitfalls that have bitten this repo

- **Ephemeral service worker.** A message can wake the worker before the async
  settings read finishes. Downloads gate on a `settingsReady` promise so they
  never run against `DEFAULT_SETTINGS`. Register all listeners at module top level
  (side-effect import in the entrypoint), not inside an async callback.
- **The popup file is `popup.html`, not `index.html`.** `chrome.action.setPopup`
  must use `'popup.html'` — otherwise `ERR_FILE_NOT_FOUND`.
- **Message router:** validate `message.type`; `return true` only for async
  handlers; `return false` for unmatched messages so the port closes (don't leak
  it on broadcasts like `DEEP_SCAN_PROGRESS`).
- **Scheme allowlist:** only surface `http(s)` (and `data:image` via base64). The
  resolver entry and `collectAv` drop `javascript:`/`data:`/`file:`/`blob:` so
  nothing dangerous reaches an `<a href>`/tab-open sink.
- **`downloads.open()` takes no callback** — a stale id surfaces only as async
  `runtime.lastError`, not a throw.
- **Content-script code-splitting under WXT** bundles the bubble into the content
  script (~300 KB); it only *mounts* when enabled. Don't add eager weight to it.

## Debugging the loaded build

Vitest covers logic; runtime bugs need the loaded build. `yarn dev` auto-reloads;
after a manual `yarn build`, hit **Reload ↻** on the extension card.

- **Service worker:** `chrome://extensions` → **Inspect views: service worker**.
  Ephemeral — may say "inactive"; a message wakes it. Watch `runtime.lastError`.
- **Popup:** right-click → Inspect. **Content script / bubble:** the page's own
  DevTools; the bubble mounts React inside a **Shadow DOM** — inspect through the
  host element. **Errors:** the red **Errors** button per extension.
- **Firefox:** `about:debugging#/runtime/this-firefox` → Inspect; `yarn lint:firefox`.
- Failure modes: wrong build loaded (rebuild, load `apps/extension/.output/…`);
  first download after wake ignores settings → check the `settingsReady` gate; a
  message does nothing → router `message.type` / async-return; restricted pages
  (`chrome://`, Web Store, PDFs) have no content script → "Can't read this page".
- Inspect `chrome.storage` **and** the durable **IndexedDB** mirror (Application →
  IndexedDB → `media-bulk-downloads` → `kv`) side by side; `storage.local` is the
  working copy, IDB the backstop `syncStores()` heals from (see `storage-and-settings`).
- `console.log` + read it back; **never** `alert/confirm/prompt` (block messaging).

## Performance guardrails (content script runs on every `<all_urls>` page)

- **Collection is network-free.** `collectMedia()` reads the DOM only; never add a
  fetch to the scan path (the sole exception, opt-in `resolveOriginals`, runs in
  the background worker). It scans every element for CSS backgrounds
  (`querySelectorAll('*')` + `getComputedStyle`) — the dominant cost on huge pages,
  re-run each deep-scan round. Keep it lean.
- **Deep scan is bounded** (`packages/core/src/collection/deepScan.ts`):
  `maxScrolls 40`, `maxMs 20000`, `maxItems 1000` (enforced in `merge()`),
  `idleRounds 3`; `waitForQuiet` 2s hard cap. Keep the ceilings.
- **Remote size enrichment** (`getImageFileSize`, popup, user-initiated) is
  concurrency-6 and generation-guarded so a rescan cancels stale writes; video/
  audio never probed. Dedup by `src` everywhere. Key popup grid tiles by `src`
  (stable) so filtering doesn't remount `LoadingImage` (virtualization deferred).
- **Durable IDB writes are fire-and-forget** — `durableSet` detaches the IDB write
  so persistence never blocks a save; don't await it (see `storage-and-settings`).

## References

- Monorepo design — `docs/architecture/monorepo-restructure.md`; package manifests
  `packages/{core,storage,platform}/package.json`, `apps/extension/package.json`
- In-repo guides — `docs/guides/`: `getting-started.md`, `architecture.md`,
  `collection-pipeline.md`, `deep-scan.md`, `download.md`, `download-paths.md`,
  `badge.md`, `bubble.md`, `history.md`, `favourites.md`, `resolve-originals.md`;
  `docs/BENCHMARK.md` for collection cost numbers
- WXT — installation https://wxt.dev/guide/installation · project structure
  https://wxt.dev/guide/essentials/project-structure · entrypoints
  https://wxt.dev/guide/essentials/entrypoints · config/manifest
  https://wxt.dev/guide/essentials/config/manifest · content scripts
  https://wxt.dev/guide/essentials/content-scripts · target browsers
  https://wxt.dev/guide/essentials/target-different-browsers · publishing
  https://wxt.dev/guide/essentials/publishing · unit testing
  https://wxt.dev/guide/essentials/unit-testing
- Chrome — manifest https://developer.chrome.com/docs/extensions/reference/manifest ·
  service workers https://developer.chrome.com/docs/extensions/develop/concepts/service-workers ·
  content scripts https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts ·
  permissions https://developer.chrome.com/docs/extensions/reference/permissions-list ·
  action/popup https://developer.chrome.com/docs/extensions/reference/api/action ·
  downloads https://developer.chrome.com/docs/extensions/reference/api/downloads ·
  messaging https://developer.chrome.com/docs/extensions/develop/concepts/messaging ·
  debug tutorial https://developer.chrome.com/docs/extensions/get-started/tutorial/debug
- Firefox — `browser_specific_settings` https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings ·
  debugging add-ons https://extensionworkshop.com/documentation/develop/debugging/ ·
  web-ext https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/
- `getComputedStyle` cost https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle ·
  React list keys https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key

Related skills: `adding-a-resolver`, `storage-and-settings`, `ui-design-system`,
`testing-and-verifying`, `releasing` — each stands alone.
