# Persistence cheatsheet (self-contained)

The storage knowledge needed to work here without external docs. Source of truth:
`packages/storage/src/`. External links are optional further reading.

## The two realms

| Realm | API | Quota | Evictable? | Used for |
|---|---|---|---|---|
| `chrome.storage.sync` | `get/set/onChanged` (key `settings`) | ~100 KB total, ~8 KB/item | no (but syncs to the user's account) | user **settings** only |
| `chrome.storage.local` | `get/set/onChanged` | ~5 MB (no `unlimitedStorage`) | **yes** (LRU under pressure) | bulk stores: history, favourites, excluded, download-queue |
| IndexedDB (`idb-keyval`) | `get/set/del` | large, `navigator.storage.persist()`-backed | **not silently** evicted | the durable **mirror** of the four bulk stores |

API forms: `chrome.storage.local.get(keys)` returns a promise **or** takes a
callback `get(keys, cb)`; same for `set`. In tests, mock the callback form:
`mockImplementation((_k, cb) => cb({ settings: {...} }))`.

## The stores (`packages/storage/src/`)

`settings.ts` (`SettingsData` + `DEFAULT_SETTINGS` + `withDefaults`), `history.ts`
(`HISTORY_CAP=500`, `HISTORY_MAX_BYTES=2_000_000`, `mergeHistory`, `loadHistory`),
`favourites.ts`, `excluded.ts`, `download-queue.ts`, `byte-budget.ts`,
`per-host-settings.ts`, `per-host-scan-memory.ts`, `backup.ts` (JSON export/import),
`save-as-hint.ts`, `idb.ts`, `sync.ts`. Types: `packages/core/src/types.ts`.

## Adding / changing a setting

1. Add the field to `SettingsData` **and** `DEFAULT_SETTINGS`.
2. `withDefaults(stored)` merges stored-over-defaults — it **is** the migration
   path (backfills old users) and **guards nested objects** (`bubblePosition`,
   `bubblePanelPoint`) so a corrupt non-object can't inject junk keys. Guard any new
   nested object the same way.
3. Validate/clamp in the Settings UI (numbers clamp on blur); hide dependent fields.

## The settings write path (single writer)

Popup/bubble **never** call `storage.sync.set` directly. They send
`SET_SETTINGS` (`useSettings.handleSettingsChange`) → the **background** sanitizes
and writes it (`background/state.ts`), then **pushes `SETTINGS_CHANGED`** to content
scripts (`message-router.ts`). The popup reacts via `storage.onChanged`; the
**bubble reacts to the push** and reads initial settings via `GET_SETTINGS` — Safari
content scripts don't reliably see sync writes/`onChanged`. Per-host overrides:
`SET_PER_HOST_SETTINGS` (`patch:null` clears the override + scan memory).

## Durable storage (the IDB mirror) — the pattern

- **`durableSet(key, value)`** (`idb.ts`): writes `chrome.storage.local` **and**
  fires a best-effort IndexedDB write. It **awaits only the local write** and
  resolves to a `boolean` (`true` persisted / `false` rejected on quota) — it never
  rejects and never swallows the failure. The IDB mirror is **not** awaited (it
  `.catch`es + warns) — awaiting it would break the single-flush timing of
  serialized history/queue writes. **Don't make it await the mirror.** Every mutation
  of a managed store goes through `durableSet`, not a raw `local.set`. The primary
  stores propagate the boolean so an upper layer can warn "storage full".
- **`syncStores()`** (`sync.ts`, called at background startup after
  `persistStorage()` = guarded `navigator.storage.persist()`): reconciles each
  `MANAGED_KEYS` (history/favourites/excluded/queue) — **local wins if present**,
  else restore from the IDB mirror. Auto-seeds the mirror for existing users on first
  run (no explicit migration). **Restore race:** it re-checks `local` right before
  restoring, so a concurrent write during the heal isn't clobbered by a stale IDB
  snapshot.
- **MV3:** `syncStores` is async but listeners register synchronously at import —
  wire listeners first, heal in the background.

## Rules that prevent real bugs

- **Ephemeral-worker settings gate.** The worker may handle a message before its
  async settings read finishes — downloads await `settingsReady`. Any new
  settings-dependent background action must too.
- **Single-writer.** History/settings mutations route through the background so
  writes serialize in one realm (cross-realm read-modify-write clobbers). Panels
  update optimistically + reconcile via `storage.onChanged`.
- **Tolerate corrupt storage.** `loadHistory` drops entries without a string `src`,
  coerces a bad `time` to 0; `mergeHistory` dedups by src, newest-first, capped.
- **Tri-state disk detection.** `srcsStillOnDisk` uses `DiskState =
  'exists'|'deleted'|'unknown'`: drop an entry only when the browser **positively**
  reports it deleted; an id the browser no longer knows is `'unknown'` → **keep**.
  Never treat "browser doesn't know this id" as "deleted".
