# WXT + MV3 cheatsheet (self-contained)

The WXT/manifest/chrome knowledge needed to work here without leaving the repo.
Source of truth: `apps/extension/wxt.config.ts` + `src/entrypoints/`. External docs
are optional further reading.

## WXT layout

- `wxt.config.ts`: `srcDir:'src'`, `publicDir:'src/public'`, `manifestVersion:3`
  (Firefox too), `imports:false` (explicit imports; use the `chrome.*` namespace),
  React via `@wxt-dev/module-react`, Tailwind via `postcss.config.js`.
- **The manifest is a function of `browser`** — return different fields per target.
  Firefox gets `browser_specific_settings.gecko` (`id`,
  `strict_min_version:'140.0'`, `gecko_android:{strict_min_version:'142.0'}`,
  `data_collection_permissions:{required:['none']}`); Chromium gets
  `minimum_chrome_version:'109'`. Safari drops `downloads`/`offscreen` + optional
  perms. Icons: 16/32/48/64/128.
- **Entrypoints** (`src/entrypoints/`) are thin WXT wrappers that side-effect-import
  the real modules under `src/extension/`: `background.ts`, `content.ts`,
  `*-media-sniffer.content.ts` (five MAIN-world sniffers: fb/hls/ig/pinterest/x),
  `offscreen/`, `popup/`. The popup file is **`popup.html`**, not `index.html`
  (`chrome.action.setPopup('popup.html')` — else `ERR_FILE_NOT_FOUND`).
- Commands: `yarn dev` / `dev:firefox`; `yarn build[:firefox|:edge|:safari|:all]`;
  `yarn zip[:…]` → `apps/extension/.output/media-bulk-downloads-<version>-<browser>.zip`
  (Firefox also `-sources.zip`). Load unpacked: `.output/chrome-mv3`.

## chrome.* APIs used here (+ the gotchas)

- **`chrome.runtime` messaging** — `sendMessage` / `onMessage`. Validate
  `message.type`; **`return true`** from a handler only when responding async (keeps
  the port open); `return false`/nothing for unmatched so the port closes. Don't
  leak the port on broadcasts (`DEEP_SCAN_PROGRESS`, `CAPTURE_PROGRESS`). Full
  message union: `packages/core/src/types.ts` (`ChromeMessage`); catalog:
  `docs/guides/architecture.md`.
- **`chrome.storage`** — `sync` (settings, ~100 KB, follows profile) vs `local`
  (bulk stores, ~5 MB, evictable). Callback or promise form. See
  `storage-and-settings` (the durable IDB mirror + single-writer rule). Safari
  content scripts don't reliably see sync writes / `onChanged` → the bubble uses
  `GET_SETTINGS` + a `SETTINGS_CHANGED` push instead.
- **`chrome.downloads`** — `download({url|blob, filename, saveAs, conflictAction})`;
  `open(id)` **takes no callback** (a stale id surfaces only as async
  `runtime.lastError`, never a throw); `search`, `show`, `onChanged`.
- **`chrome.offscreen`** — Chrome/Edge only (not Firefox/Safari). Hosts HLS/DASH
  assembly (`createDocument` with a reason + justification). Fallback on other
  targets via the `@mbd/platform` seam.
- **`chrome.tabs`** — `query({active,currentWindow})`, `sendMessage(tabId,…)`,
  `create({url})`. **Not available in the content-script bubble** — a bare
  `chrome.tabs` call throws there; guard on `surface` or use an `<a>`.
- **`chrome.action`** — `setBadgeText`/`setBadgeBackgroundColor`/`setPopup`;
  `onClicked` fires only when no popup is set (the bubble clears the popup).
- **`chrome.contextMenus`**, **`chrome.notifications`** (optional perm),
  **`chrome.declarativeNetRequest`** (the `…WithHostAccess` variant, optional perm,
  for the hotlink-403 Referer retry — session rule, torn down immediately).

## MV3 service-worker lifecycle (the class of bug)

The worker is **ephemeral** — it's killed when idle and woken by an event. So:

- **Register every listener synchronously at module top level** (side-effect import
  in the entrypoint) — never inside an async callback, or the wake-up event is
  missed.
- A message can wake the worker **before** its async settings read finishes.
  Downloads await a **`settingsReady`** promise so they never run against
  `DEFAULT_SETTINGS`. Any new settings-dependent background action must await it.
- Async listeners must `return true`.

## Scheme allowlist (security)

Only surface `http(s)` (and `data:image` via base64). The registry entry and
`collectAv` drop `javascript:`/`data:`(non-image)/`file:`/`blob:` so nothing
dangerous reaches an `<a href>`/tab-open sink. Shape-validate page-controlled ids
(`/^[a-z0-9]+$/i`) before URL interpolation; pin API-JSON URLs to https + expected
host (`pinnedUrl`).

## Debugging the loaded build

- SW: `chrome://extensions` → **Inspect views: service worker** (may say inactive —
  a message wakes it; watch `runtime.lastError`). Popup: right-click → Inspect.
  Content/bubble: the page's DevTools; the bubble is a **Shadow DOM** under its host
  element. Per-extension **Errors** button. Firefox:
  `about:debugging#/runtime/this-firefox`.
- Inspect `chrome.storage.local` **and** the IDB mirror (Application → IndexedDB →
  `media-bulk-downloads` → `kv`) side by side.
- `console.log` + read it back; **never** `alert/confirm/prompt` (blocks messaging).
