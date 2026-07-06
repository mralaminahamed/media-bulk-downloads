# Deep Scan

Deep scan surfaces media that isn't in the DOM until the page scrolls —
virtualized feeds (Twitter/X timelines), infinite scroll, and lazy carousels.
It is **opt-in**, **bounded**, and **network-free on our side**: it only scrolls
and re-reads the DOM; the page loads its own media.

## Popup path (over messaging)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant P as Popup (App.handleDeepScan)
  participant C as deepScanActiveTab
  participant CS as Content script
  participant R as startDeepScan / runDeepScan
  participant DOM as Page DOM

  U->>P: click ⇊ Deep scan
  P->>C: deepScanActiveTab(onProgress)
  C->>C: add runtime.onMessage listener (progress)
  C->>CS: sendMessage("DEEP_SCAN")  [channel held open]
  CS->>CS: new AbortController + read Settings caps
  CS->>R: startDeepScan(onProgress, signal, caps)
  loop until idle / cap / abort
    R->>DOM: scrollStep() (one viewport)
    R->>DOM: waitForQuiet() (MutationObserver settles ~400ms)
    R->>DOM: collectMedia() → merge (dedup by src)
    R-->>CS: onProgress(found, scrolls, elapsedMs)
    CS-->>C: sendMessage("DEEP_SCAN_PROGRESS")
    C-->>P: onProgress → "scanning… N found"
  end
  R->>DOM: restoreScroll() (finally)
  R-->>CS: MediaItem[]
  CS-->>C: sendResponse(media)  [always — .then and .catch]
  C->>C: remove progress listener (finally)
  C-->>P: MediaItem[]
  P->>P: merge into rawImagesRef → filter → render

  opt User clicks Stop
    U->>P: click Stop
    P->>CS: sendMessage("DEEP_SCAN_ABORT")
    CS->>R: AbortController.abort()
    R->>R: loop breaks, returns partial results
  end
```

## Bubble path (in-page, no messaging)

The bubble runs inside the page, so it drives the loop directly.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Bubble App (handleDeepScan)
  participant A as deepScanLocal (own AbortController)
  participant R as startDeepScan / runDeepScan
  participant DOM as Page DOM

  U->>B: click ⇊ Deep scan
  B->>A: deepScanLocal(onProgress)
  A->>R: startDeepScan(onProgress, signal, caps from initialSettings)
  loop until idle / cap / abort
    R->>DOM: scroll · wait · collectMedia · merge
    R-->>B: onProgress → progress text
  end
  R->>DOM: restoreScroll()
  R-->>B: MediaItem[] → merge → render
```

## The loop (`shared/collection/deepScan.ts` — pure)

```mermaid
flowchart TB
  SEED["seed: merge(collect())"] --> LOOP{"loop"}
  LOOP -->|"aborted?"| STOP
  LOOP -->|"found ≥ maxItems?"| STOP
  LOOP -->|"elapsed ≥ maxMs?"| STOP
  LOOP --> SCROLL["scrollStep()<br/>page + nested scrollers<br/>(+ opt-in load-more clicks)"]
  SCROLL --> WAIT["await waitForQuiet(signal)"]
  WAIT -->|"aborted?"| STOP
  WAIT --> MERGE["added = merge(collect())"]
  MERGE --> PROG["onProgress(found, scrolls, elapsed)"]
  PROG --> CHK{"added == 0 ?"}
  CHK -->|"yes"| IDLE["idle++"]
  IDLE -->|"idle ≥ idleRounds"| STOP
  IDLE -->|"atBottom()"| STOP
  IDLE --> LOOP
  CHK -->|"no"| RESET["idle = 0"] --> LOOP
  LOOP -->|"scrolls > maxScrolls"| STOP
  STOP["restoreScroll() (finally) → return [...found]"]
```

### Bounds (defaults in `DEEP_SCAN_DEFAULTS`; the first three are user-configurable)

`maxItems` / `maxMs` / `maxScrolls` are **defaults only** — the popup path reads
the user's **Settings → Deep scan** values and passes them into `startDeepScan`,
overriding these. Only `idleRounds` is a genuinely fixed, non-configurable cap.

| Cap          | Default | Configurable in Settings? | Meaning                                             |
|--------------|---------|---------------------------|-----------------------------------------------------|
| `maxItems`   | 1000    | yes (50–5000)             | Stop once this many unique items are found          |
| `maxMs`      | 20000   | yes (5–120 s, ×1000)      | Wall-clock ceiling (~20s)                           |
| `maxScrolls` | 40      | yes (5–200)               | Hard scroll-step ceiling                            |
| `idleRounds` | 3       | no (fixed)                | Stop after N consecutive steps that add nothing new |

### Stop reasons

The final progress event carries a `reason` (`DeepScanStopReason`) so the popup
can say *why* a scan ended early:

| Reason         | Trigger                                                  |
|----------------|----------------------------------------------------------|
| `complete`     | Idle rounds hit or page bottom reached — nothing left    |
| `max-items`    | `maxItems` cap reached                                   |
| `max-time`     | `maxMs` wall-clock cap reached                           |
| `max-scrolls`  | `maxScrolls` step cap reached                            |
| `aborted`      | User pressed Stop (`AbortController`)                    |

### Scroll surfaces & load-more

- **Nested scrollers** (always on): each step also advances any nested
  `overflow-y: auto|scroll` pane taller than 200px, not just the page — so media
  inside inner scroll containers surfaces too.
- **Load-more clicking** (opt-in, **off by default** — Settings → Deep scan →
  *Click "Load more" buttons*): when enabled, each step may click up to 3
  matching `<button>` / `role=button` controls per round (text like "load more",
  "show more"). Real buttons only — never `<a href>` links, to avoid navigating
  away.

## Guarantees

- **Scroll is always restored** (`restoreScroll()` runs in `finally`), even on
  abort or a thrown error.
- **No listener/observer leaks**: `waitForQuiet` disconnects its `MutationObserver`
  and clears both timers on every exit path; the popup client removes its progress
  listener in `finally`.
- **The message channel always closes**: the `DEEP_SCAN` handler calls
  `sendResponse` on both success and failure, so the popup never hangs.
- **No data loss on merge**: results merge into the raw collected set
  (`rawImagesRef`), so images previously hidden by a size/base64 filter aren't
  discarded and reappear if the filter is relaxed.
- **Resolution still applies**: each scan round calls the same `collectMedia()`
  as the initial scan, so newly-found items can carry `resolveHint`/
  `unresolvedVideo` just like any other item; after the merge, `applyResolution`
  runs again and resolves them too when `resolveOriginals` is on — see
  [Resolve Originals](./resolve-originals.md).

Pipeline that each scan round feeds into: [Collection Pipeline](./collection-pipeline.md) ·
[Resolve Originals](./resolve-originals.md).
