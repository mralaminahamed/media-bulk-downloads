# Download History

Every **successful** download is recorded to a **Download History** list that
survives across pages, tabs, and browser restarts — so you can find, re-open,
or re-download something you saved earlier without hunting through the OS
downloads folder.

## Using it

- Open the **Download History** panel from the ⏱ button in the header.
- Each row offers:

| Action             | Needs `downloadId`? | Effect                                                                                           |
|--------------------|---------------------|--------------------------------------------------------------------------------------------------|
| **Open source**    | no                  | Opens the original media URL in a new tab (`OPEN_URL`)                                           |
| **Open file**      | yes                 | Opens the downloaded file in the OS default app (`OPEN_DOWNLOAD_FILE` → `chrome.downloads.open`) |
| **Show in folder** | yes                 | Reveals the file in the OS file manager (`SHOW_DOWNLOAD` → `chrome.downloads.show`)              |
| **Re-download**    | no                  | Re-runs the normal [Download](./download.md) flow (`DOWNLOAD_IMAGES`)                            |
| **Remove**         | no                  | Deletes this one entry (`REMOVE_HISTORY_ENTRY`)                                                  |
| **Clear all**      | no                  | Empties the whole history (`CLEAR_HISTORY`), header button                                       |

"Open file" and "Show in folder" only render when the entry carries a
`downloadId` — present on every download recorded going forward, but absent
on entries carried over from before this was tracked.

- A collected tile already in history shows a ✓ badge in the grid (from
  `downloadedSrcSet`) — distinct from the toolbar count in [Badge](./badge.md).

## How it works

- Stored in `chrome.storage.local` under the `downloadHistory` key
  (`HISTORY_KEY`), deduped by media `src` (newest wins), sorted newest-first,
  and capped at 500 entries (`mergeHistory`, `HISTORY_CAP`).
- Every mutation — the automatic write on a successful download, and user
  edits (remove / clear) — is routed through the background service worker (a
  single writer) and serialized through one `writeChain`, so concurrent
  read-modify-write ops can never clobber each other.
- Every open surface (popup + on-page bubble) reconciles via
  `chrome.storage.onChanged` — nobody polls.
- History is independent of [Favourites](./favourites.md): an item can be in
  both, either, or neither.

## Recording a download → live sync

```mermaid
sequenceDiagram
  autonumber
  participant D as chrome.downloads
  participant SW as downloadAndRecord (background.ts)
  participant H as recordDownloads (history.ts)
  participant ST as chrome.storage.local
  participant HP as HistoryPanel
  participant AP as App (grid)

  D-->>SW: downloadId (per successful download)
  SW->>H: recordDownloads(entries)
  H->>H: mergeHistory(existing, added)<br/>dedup by src · newest-first · cap 500
  H->>ST: storage.local.set({ downloadHistory: merged })
  ST-->>HP: storage.onChanged (area:"local")
  ST-->>AP: storage.onChanged (area:"local")
  HP->>HP: reload entries → re-render list
  AP->>AP: rebuild downloadedSrcSet → ✓ badge on matching tiles
```

Row actions (Remove, Clear all) write through the same `recordDownloads` /
`removeEntry` / `clearHistory` path and end at the same `storage.onChanged`
fan-out — there's no separate code path for user edits vs. automatic
recording.

## Implementation

`packages/storage/src/history.ts` (`HISTORY_KEY`, `HISTORY_CAP`,
`mergeHistory`, `recordDownloads`, `removeEntry`, `clearHistory`,
`downloadedSrcSet`), `apps/extension/src/extension/background/index.ts` (`downloadAndRecord`, and
the `CLEAR_HISTORY` / `REMOVE_HISTORY_ENTRY` / `OPEN_DOWNLOAD_FILE` /
`SHOW_DOWNLOAD` message handlers), and
`apps/extension/src/extension/popup/components/panels/HistoryPanel.tsx`.

See also: [Download](./download.md) · [Favourites](./favourites.md) ·
[Architecture](./architecture.md).
