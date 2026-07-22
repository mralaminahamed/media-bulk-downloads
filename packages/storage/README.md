# @mbd/storage — Persistence Layer

The extension's **persistence layer**: settings, download history, favourites,
excluded sources, the download queue, per-host memory, and backup/sync — over
`chrome.storage` + IndexedDB, behind a Safari-safe API.

## Public API

Each module is imported directly via `@mbd/storage/<module>`:

| Module                  | What it persists                                              |
|-------------------------|--------------------------------------------------------------|
| `settings`              | User preferences (`chrome.storage.sync`)                     |
| `history`               | Download history (`chrome.storage.local`) — merge/dedup/cap  |
| `favourites`            | Starred media, same merge/dedup/cap shape                    |
| `excluded`              | Blocked source hosts / URLs                                  |
| `download-queue`        | The persistent, resumable download queue                     |
| `per-host-settings`     | Per-site setting overrides                                   |
| `per-host-scan-memory`  | Learned deep-scan settle-time + scroll depth per host        |
| `byte-budget`           | In-memory download byte accounting                           |
| `save-as-hint`          | "Ask where to save" one-shot hint state                      |
| `backup` / `sync`       | JSON export/import; cross-context sync plumbing              |
| `idb`                   | IndexedDB helper (`idb-keyval`) backing the mirror           |

## Boundary

Depends on [`@mbd/core`](../core/README.md) for types. Owns all `chrome.storage`
+ IndexedDB access; UI and the app talk to it through the background service
worker (message-passing), never directly, so writes stay serialized. Runtime dep:
`idb-keyval`.

## Tests

Vitest project under `tests/` (one suite per module, plus IDB-failure cases). Run
from the repo root:

```bash
yarn test
```

## More

See the [Architecture guide](https://mralaminahamed.github.io/media-bulk-downloads/how-it-works/architecture/) (data model +
message catalog) and the
[Monorepo restructure](../../docs/architecture/monorepo-restructure.md) design
record for how this package fits the whole.
