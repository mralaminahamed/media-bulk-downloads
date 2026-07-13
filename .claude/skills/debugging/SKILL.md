---
name: debugging
description: Debug this extension's runtime — the background service worker, content script, on-page bubble, popup, badge, and messaging — across Chrome, Edge, and Firefox. Use when something works in tests but not in the loaded extension, the popup/bubble misbehaves, a download or message fails, or an error appears in chrome://extensions.
---

# Debugging the loaded extension

Vitest covers logic; runtime bugs need the loaded build. `yarn dev` auto-reloads on
change; after a manual `yarn build`, hit **Reload ↻** on the extension card.

## Where to look

- **Service worker (background):** `chrome://extensions` → the extension →
  **Inspect views: service worker**. It's ephemeral — it may say "inactive"; a
  message wakes it. Watch for `runtime.lastError` (downloads.open/show surface
  errors here, not as throws).
- **Popup:** right-click the popup → Inspect (or open its devtools). Note the
  popup file is `popup.html` — a `setPopup('index.html')` would 404 with
  `ERR_FILE_NOT_FOUND`.
- **Content script / on-page bubble:** the page's own DevTools console; the bubble
  mounts React inside a **Shadow DOM**, so inspect through the host element.
- **Errors:** `chrome://extensions` shows a red **Errors** button per extension.
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Inspect**; validate the
  package with `yarn lint:firefox` (web-ext).

## Common failure modes seen here

- **Wrong build loaded** — a stale `apps/extension/.output` or the old `dist/` (which no longer
  exists). Rebuild and reload; load `apps/extension/.output/chrome-mv3` (or `firefox-mv3`).
- **First download after worker wake uses defaults** — the settings gate
  (`settingsReady`) fixes this; if a download ignores settings, check that gate.
- **Popup blends into a white page** (bubble surface) — that's the on-page bubble;
  it has a dim backdrop.
- **A message does nothing** — confirm the router matches `message.type` and the
  handler returns `true` only when responding async.
- **Restricted pages** (`chrome://`, the Web Store, PDFs) have no content script —
  the popup shows a distinct "Can't read this page" error state.

## Tips

- Use `console.log` + read it back; **do not** trigger `alert/confirm/prompt`
  (they block the extension messaging in automated contexts).
- `chrome.storage` is inspectable in the SW/popup devtools Application tab, as is
  the durable **IndexedDB** mirror (Application → IndexedDB → `media-bulk-downloads`
  → `kv`). If history/favourites look wrong, compare the two: `storage.local` is the
  working copy, IndexedDB the backstop that `syncStores()` heals from at startup.

## References

- Debug tutorial — https://developer.chrome.com/docs/extensions/get-started/tutorial/debug
- Service workers (lifecycle) — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- Firefox: debugging add-ons — https://extensionworkshop.com/documentation/develop/debugging/
- web-ext — https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/

Related skill: `extension-dev` (build/run) — optional; this skill stands alone.
