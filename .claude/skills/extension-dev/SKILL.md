---
name: extension-dev
description: Build, run, and package this WXT Manifest-V3 extension for Chrome/Firefox/Edge, and avoid the MV3 pitfalls specific to this repo. Use when working on entrypoints, the manifest, the background service worker, content scripts, permissions, or any "how do I build/dev/zip/load the extension" question.
---

# Extension development (WXT · MV3 · Chrome/Firefox/Edge)

This extension is built with **[WXT](https://wxt.dev)** from one codebase. Always
use **Corepack Yarn**, never npm. Node **20.19+** (`.nvmrc` pins 22).

## Commands

```bash
yarn dev            # Chrome dev (HMR) → apps/extension/.output/chrome-mv3
yarn dev:firefox    # Firefox dev profile
yarn build          # apps/extension/.output/chrome-mv3       (also :firefox, :edge, :all)
yarn zip            # store zip in apps/extension/.output/     (also :firefox, :edge, :all)
yarn type-check     # wxt prepare + tsc --noEmit   ← run before trusting tsc
yarn lint           # eslint
yarn test           # vitest + coverage
```

Zips: `apps/extension/.output/media-bulk-downloads-<version>-<browser>.zip` (Firefox also emits
a `-sources.zip` for AMO). Version comes from `package.json`. Load unpacked:
`apps/extension/.output/chrome-mv3` (or `firefox-mv3`). There is **no** `dist/` or `release/`.

## Structure

- `apps/extension/wxt.config.ts` — `srcDir: 'src'`, `publicDir: 'src/public'`, `manifestVersion: 3`
  (Firefox too), `imports: false` (no auto-imports — use explicit imports and the
  `chrome.*` namespace), React via `@wxt-dev/module-react`, Tailwind via
  `postcss.config.js`. The manifest is a **function of `browser`** — Firefox gets
  `browser_specific_settings.gecko` (id, `strict_min_version`,
  `data_collection_permissions`).
- `apps/extension/src/entrypoints/{background,content,popup}` — thin WXT wrappers that
  side-effect-import the real modules under `apps/extension/src/extension/`.
- `apps/extension/src/extension/` — background worker, content script, `popup/` + `bubble/` React UI.

Permissions (keep in sync with `apps/extension/wxt.config.ts`): `downloads`, `downloads.open`,
`storage`, `tabs`, `contextMenus`, `offscreen`, host `<all_urls>`, plus **optional**
`notifications` and `declarativeNetRequestWithHostAccess` requested at runtime. See
the `permissions-and-privacy` skill for the full table + justifications.

Tailwind is compiled via `postcss.config.js` (`@tailwindcss/postcss`) and imported
with a **prefix** — every utility class is `mbd:…` (see the `ui-design-system`
skill). A bare utility is a silent no-op.

## MV3 pitfalls that have bitten this repo

- **Ephemeral service worker.** A message can wake the worker before the async
  settings read finishes. Downloads gate on a `settingsReady` promise
  (`background.ts`) so they never run against `DEFAULT_SETTINGS`. Register all
  listeners at module top level (via a side-effect import in the entrypoint), not
  inside an async callback.
- **The popup file is `popup.html`, not `index.html`.** `chrome.action.setPopup`
  must use `'popup.html'`.
- **Message router:** validate `message.type`; `return true` only for handlers
  that answer asynchronously; `return false` for unmatched messages so the port
  closes (don't leak it on broadcasts like `DEEP_SCAN_PROGRESS`).
- **Scheme allowlist:** only ever surface `http(s)` (and `data:image` via the
  base64 path). The resolver entry and `collectAv` drop `javascript:`/`data:`/
  `file:`/`blob:` so nothing dangerous reaches an `<a href>`/tab-open sink.
- **`downloads.open()` takes no callback** — a stale id surfaces only as an async
  `runtime.lastError`, not a throw.
- **Content-script code-splitting under WXT** bundles the bubble into the content
  script (~300 KB); it still only *mounts* when enabled. Lazy-chunking it back out
  is a known follow-up.

## In-repo docs

`docs/guides/` (architecture, collection-pipeline, download, badge, bubble) for
deeper walkthroughs; `docs/store-submissions/CHROME_WEBSTORE.md` for store submission.

## References

WXT:
- Installation — https://wxt.dev/guide/installation
- Project structure — https://wxt.dev/guide/essentials/project-structure
- Entrypoints — https://wxt.dev/guide/essentials/entrypoints
- Config / manifest — https://wxt.dev/guide/essentials/config/manifest
- Content scripts — https://wxt.dev/guide/essentials/content-scripts
- Extension APIs — https://wxt.dev/guide/essentials/extension-apis
- Target different browsers — https://wxt.dev/guide/essentials/target-different-browsers
- Publishing / zip — https://wxt.dev/guide/essentials/publishing

Chrome:
- Get started tutorial — https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world
- Manifest reference — https://developer.chrome.com/docs/extensions/reference/manifest
- Service workers (background) — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- Content scripts — https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Permissions list — https://developer.chrome.com/docs/extensions/reference/permissions-list
- action / popup — https://developer.chrome.com/docs/extensions/reference/api/action
- chrome.downloads — https://developer.chrome.com/docs/extensions/reference/api/downloads
- Message passing — https://developer.chrome.com/docs/extensions/develop/concepts/messaging

Firefox: `browser_specific_settings` — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings

