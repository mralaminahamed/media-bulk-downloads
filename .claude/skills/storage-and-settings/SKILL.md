---
name: storage-and-settings
description: Work with this extension's persisted state — user settings (chrome.storage.sync), the bulk stores (download history, favourites, excluded, download queue in chrome.storage.local), and their durable IndexedDB write-through mirror — including defaults, tolerating legacy/corrupt shapes, the single-writer rule, the ephemeral-worker settings gate, durableSet, and the startup heal. Use when adding a setting, changing the history/favourites/queue model, touching anything under shared/storage/ (settings.ts, history.ts, idb.ts, sync.ts, ...), or reasoning about persistence/durability/migrations.
---

# Storage & settings

Two realms, several stores:

- **Settings → `chrome.storage.sync`** (key `settings`). Follows the user's Chrome
  profile. `SettingsData` in `src/types`. Defaults + merge in `shared/storage/settings.ts`.
- **Bulk state → `chrome.storage.local`**, one module per store:
  - Download history (`downloadHistory`, `shared/storage/history.ts`) — cap
    `HISTORY_CAP = 500`, also byte-bounded to `HISTORY_MAX_BYTES = 2_000_000`.
  - Favourites (`shared/storage/favourites.ts`), excluded sources
    (`shared/storage/excluded.ts`), the download queue
    (`shared/storage/download-queue.ts`).
  - `backup.ts` (manual JSON export/import) and `save-as-hint.ts` (one-time hint
    dismissal).

These four bulk stores (history, favourites, excluded, queue) are **write-through
mirrored to IndexedDB** so `chrome.storage.local` eviction can't lose them — see
"Durable storage" below. `chrome.storage.local` stays the reactive working copy;
IndexedDB is the durable backstop.

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

## Durable storage (the IndexedDB mirror)

`chrome.storage.local` is evictable and only ~5 MB (no `unlimitedStorage`), so
users have lost history/favourites. The fix is a write-through mirror to
IndexedDB, which is not silently evicted:

- **`shared/storage/idb.ts`** — a tiny `idb-keyval` binding (one DB
  `media-bulk-downloads`, store `kv`) plus **`durableSet(key, value)`**: it writes
  `chrome.storage.local` **and** fires a best-effort IndexedDB write. Every mutation
  of a managed store goes through `durableSet` instead of a raw
  `chrome.storage.local.set`.
- **Fire-and-forget.** `durableSet` returns the *local* set's promise and does
  **not** await the IDB write (it `.catch`es and warns). Awaiting it would break the
  single-flush timing of serialized history/queue writes. Don't make it await.
- **`shared/storage/sync.ts`** — at startup `background/index.ts` calls
  `persistStorage()` (guarded `navigator.storage.persist()` — best effort) and
  `syncStores()`. `syncStores` reconciles each `MANAGED_KEYS`
  (history / favourites / excluded / queue): **local wins if present**, otherwise
  restore from the IDB mirror. This auto-seeds the mirror for existing users on
  first run — no explicit migration.
- **Restore race:** `syncStores` re-checks `chrome.storage.local` right before
  restoring from IDB, so a concurrent write that landed during the heal isn't
  clobbered by a stale IDB snapshot.
- MV3: `syncStores` is async, but listeners must register synchronously at import —
  wire listeners first, heal in the background; don't block wiring on the heal.

## The downloaded-mark data-loss fix (tri-state disk detection)

A history entry showed "downloaded" only while `chrome.downloads.search` still knew
its `downloadId` — so clearing Chrome's own download history made every past
download read as **not downloaded**. `srcsStillOnDisk(history, stateById)` is now
tri-state (`DiskState = 'exists' | 'deleted' | 'unknown'`): an entry is dropped only
when the browser **positively** reports it deleted; an id the browser no longer
knows (`'unknown'`) is **kept**. The message router maps
`downloads.search` results into that tri-state. When touching downloaded-state
detection, never treat "browser doesn't know this id" as "deleted".

## References

- Settings + history source (this repo) — `src/extension/shared/storage/settings.ts`,
  `src/extension/shared/storage/history.ts`, `src/extension/shared/storage/idb.ts`,
  `src/extension/shared/storage/sync.ts`, `src/types/index.d.ts`
- idb-keyval — https://github.com/jakearchibald/idb-keyval
- StorageManager.persist() — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- chrome.storage — https://developer.chrome.com/docs/extensions/reference/api/storage
- sync vs local (quotas) — https://developer.chrome.com/docs/extensions/reference/api/storage#storage-areas
- Firefox storage — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage

Related skills: `extension-dev` (the settings gate), `debugging` (inspecting
storage) — optional; this skill stands alone.
