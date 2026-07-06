---
name: storage-and-settings
description: Work with this extension's persisted state — user settings (chrome.storage.sync) and download history (chrome.storage.local) — including defaults, tolerating legacy/corrupt shapes, the single-writer rule, and the ephemeral-worker settings gate. Use when adding a setting, changing the history model, touching shared/storage/settings.ts or shared/storage/history.ts, or reasoning about persistence/migrations.
---

# Storage & settings

Two stores, two purposes:

- **Settings → `chrome.storage.sync`** (key `settings`). Follows the user's Chrome
  profile. `SettingsData` in `src/types`. Defaults + merge in `shared/storage/settings.ts`.
- **Download history → `chrome.storage.local`** (key `downloadHistory`, cap
  `HISTORY_CAP = 500`). Device-local. Logic in `shared/storage/history.ts`.

## Adding / changing a setting

1. Add the field to `SettingsData` and to `DEFAULT_SETTINGS` (`shared/storage/settings.ts`).
2. `withDefaults(stored)` merges stored over defaults and is the migration path —
   it backfills missing fields for old users and **guards nested objects**
   (`bubblePosition`, `bubblePanelPoint`) so a corrupt non-object value can't inject
   junk keys. Keep new nested objects guarded the same way.
3. The popup **owns writing settings** (`App.handleSettingsChange` →
   `storage.sync.set`); everything else reads. The background and bubble react via
   `storage.onChanged`.
4. Validate/clamp in the UI (Settings inputs clamp numbers on blur) and hide
   dependent fields when they don't apply.

## Rules that prevent real bugs

- **Ephemeral-worker settings gate.** The service worker may handle a message
  before its async settings read finishes. Downloads await a `settingsReady`
  promise (`background.ts`) so they never run against `DEFAULT_SETTINGS`. Any new
  background action that depends on settings must await it too.
- **Single-writer for history.** All history mutations route through the background
  (`CLEAR_HISTORY` / `REMOVE_HISTORY_ENTRY` messages + `recordDownloads`) so writes
  serialize in one realm — the popup/bubble don't write `storage.local` directly
  (cross-realm read-modify-write would clobber). The panel updates optimistically
  and reconciles via `storage.onChanged`.
- **Tolerate corrupt storage.** `loadHistory` drops entries without a string `src`
  and coerces a bad `time` to 0; `mergeHistory` dedups by src, newest-first, capped.

## References

- Settings + history source (this repo) — `src/extension/shared/storage/settings.ts`,
  `src/extension/shared/storage/history.ts`, `src/types/index.d.ts`
- chrome.storage — https://developer.chrome.com/docs/extensions/reference/api/storage
- sync vs local (quotas) — https://developer.chrome.com/docs/extensions/reference/api/storage#storage-areas
- Firefox storage — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage

Related skills: `extension-dev` (the settings gate), `debugging` (inspecting
storage) — optional; this skill stands alone.
