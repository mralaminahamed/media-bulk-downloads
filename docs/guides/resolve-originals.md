# Resolve Originals

**Resolve exact originals** is an **opt-in** setting (`resolveOriginals`,
default **off**) that fetches the exact highest-resolution file from a handful
of supported hosts — a Twitter video's real mp4, a Wallhaven wallpaper's true
full-size file, an Unsplash photo's native master. It's the only feature in the
extension that contacts a host other than the page you're on.

## Two phases

Resolution always happens in two separate phases — a network-free one that
always runs, and a network one that runs only when you turn the setting on.

| Phase                      | When                             | Network?                           | Where                                              |
|----------------------------|----------------------------------|------------------------------------|----------------------------------------------------|
| **Passive URL resolution** | Every collection / deep scan     | None — `allowNetwork:false`        | `resolve()` registry, in-page (`collect.ts`)       |
| **Opt-in network resolve** | Only if `resolveOriginals` is on | Yes — a handful of `fetch()` calls | Background service worker (`resolvers/network.ts`) |

Phase one is [Collection Pipeline](./collection-pipeline.md)'s `resolve()`
registry: `twitterResolver → unsplashResolver → wallhavenResolver →
genericResolver`. For most URLs it fully resolves the original with no network
call at all — Twitter `name=orig`, Unsplash query-param stripping, Wallhaven
full-file paths built from the DOM's own extension evidence. It only reaches
for phase two when it *can't* finish the job locally, by attaching a
`resolveHint` (or marking a video `unresolvedVideo`) instead of guessing or
fetching.

## What it contacts

Phase two is `resolveOriginal(hint, deps)` in
`src/extension/shared/resolvers/network.ts`, called from the background
service worker only (never from a content script or the popup directly):

| Platform    | Endpoint                                                                       | What it fetches                                                                                                                                                                                                             |
|-------------|--------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `twitter`   | `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<token>&lang=en` | The tweet's syndication JSON; picks the highest-bitrate `video/mp4` variant from `mediaDetails[].video_info.variants`. The token is derived with the same (public, key-free) algorithm as react-tweet's syndication client. |
| `wallhaven` | `https://wallhaven.cc/api/v1/w/<id>`                                           | The wallpaper's public API record; reads `data.path` (the full-size file URL).                                                                                                                                              |
| `unsplash`  | *(no fetch)*                                                                   | Builds `https://unsplash.com/photos/<id>/download` directly — Unsplash's own download-redirect URL. The request only actually happens later, if the item is downloaded, via `chrome.downloads`.                             |

Every URL taken out of a JSON response is passed through `pinnedUrl()` before
it's trusted: it must be `https:` and its hostname must equal (or be a
subdomain of) the expected host (`twimg.com` / `wallhaven.cc`). Anything else —
a malformed URL, an unexpected redirect target — resolves to `null` instead of
being handed back as a downloadable URL. `resolveOriginal()` never throws; a
failed lookup for one item just means that item stays as collected — or, for a
per-item "Get video" request, is surfaced as failed rather than silently
dropped (see [On-demand](#on-demand-the-get-video-button) below).

A tweet can also fail to resolve for a reason that has nothing to do with
`pinnedUrl()`: the syndication endpoint itself returns a tombstone-shaped
response — no usable `mediaDetails` — for tweets it won't serve up, commonly
ones marked **age-restricted or sensitive**. `twitter()` finds no `video/mp4`
variant in that response and returns `null`, the same as any other miss.

## End-to-end flow

```mermaid
sequenceDiagram
  autonumber
  participant CM as collectMedia() (content script)
  participant P as Popup / Bubble (App.tsx)
  participant BG as background.ts
  participant NET as resolvers/network.ts
  participant EXT as External host

  Note over CM: Phase 1 — always network-free
  CM->>CM: resolve(url, { allowNetwork:false })
  CM-->>P: MediaItem[] (some carry resolveHint / unresolvedVideo:true)
  P->>P: applyResolution() — show every eligible item, pending videos included<br/>excluded from the downloadable set until resolved

  alt settings.resolveOriginals is ON
    P->>P: enrichOriginals(eligible) — collect items with a resolveHint
    P->>BG: sendMessage({ type:"RESOLVE_ORIGINALS", hints })
    BG->>BG: resolveOriginalsBatch(hints) — dedup by src, concurrency 4
    loop each hint
      BG->>NET: resolveOriginal(hint)
      NET->>EXT: fetch (Twitter syndication / Wallhaven API)<br/>Unsplash: URL built, no fetch
      EXT-->>NET: JSON (twitter/wallhaven only)
      NET-->>BG: resolved URL, or null on failure
    end
    BG-->>P: { resolved: { src -> url } }
    P->>P: enrichOriginals() swaps src, clears resolveHint/unresolvedVideo<br/>pending videos already on screen become downloadable in place
  else OFF
    P->>P: hinted items keep their collected src<br/>pending videos stay visible, still not downloadable
  end
```

- `applyResolution()` (`popup/App.tsx`) displays every eligible item straight
  away — poster-only pending videos included — then calls `enrichOriginals`
  only `if (s.resolveOriginals)`. This runs on every path that can populate the
  grid — the initial scan, a manual rescan, a deep-scan merge, and a settings
  change — so **toggling the setting on later retroactively resolves
  already-collected items** without a fresh scan.
- `enrichOriginals()` never mutates an item in place: a resolved hit becomes a
  new object with `src` swapped to the resolved URL and `resolveHint`/
  `unresolvedVideo` cleared, then replaces the old entry wherever its old `src`
  is found. A pending video that was already on screen just swaps its poster
  for the real mp4 in place — moving from "shown, not downloadable" to
  downloadable without ever disappearing or re-appearing. An item whose hint
  never resolves simply stays as it was: visible, still excluded from the
  downloadable set.
- A generation counter (`resolveGenRef`) discards a resolution that finishes
  after a newer scan/rescan has already started, so a slow request can't
  clobber fresher results.

## On-demand: the "Get video" / "Get all videos" buttons

Phase two has three triggers — the diagram above is the first:

| Trigger                      | Where it lives                                                                                                | Gated by `resolveOriginals`?                   |
|------------------------------|---------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| **Global auto-resolve**      | `enrichOriginals()`, run from `applyResolution()` on every scan, rescan, deep-scan merge, and settings change | Yes — only fires `if (s.resolveOriginals)`     |
| **Bulk "Get all videos (N)"**| Footer button, `handleFetchAllVideos()` (`popup/App.tsx`) — resolves every pending video in the current view in one batched request; shown only when `N > 0` | No — explicit user action for all N at once |
| **Per-item "Get video"**     | The action button on a pending video's grid tile / preview modal, `handleFetchVideo()` (`popup/App.tsx`)      | No — fires unconditionally, one hint at a time |

All three triggers end up calling the exact same `RESOLVE_ORIGINALS` message and
the same `resolveOriginal(hint, deps)` in the background; the only
differences are how many hints go in the request (the whole eligible batch vs.
a single one) and whether the setting gates the call at all. The button is a
deliberate, one-item request the user just made by clicking it, so it doesn't
wait for the passive-collection setting to be on. A pending video that never
picked up a `resolveHint` in the first place — no `/status/` link nearby and
no status id recoverable from the page URL either — has no button to press;
its tile just reads "can't fetch".

While a per-item fetch is in flight the tile shows a spinner and the button is
disabled. On success the item's `src` is swapped to the resolved mp4 in
place, `unresolvedVideo` is cleared, and it joins the downloadable set — same
end state as the automatic path, just for one item on request.

### Graceful failure

A `null` result — a tombstoned tweet, a rejected redirect, a network error —
is never silently dropped for a per-item request the way it can be for the
background auto-resolve. `handleFetchVideo()` records the failed `src`, and
the tile's label switches to "couldn't fetch" (the preview modal shows
"Couldn't fetch — retry"), with the button itself turning into "Retry video"
so the user can try again — for example once an age-restricted tweet is no
longer tombstoned, or after a transient network blip.

## Privacy

- **Off by default.** Every other feature — collection, deep scan, size
  enrichment — either reads only what the page already loaded or (image-size
  `HEAD` requests) stays on the same host; this is the one setting that talks
  to Twitter/Wallhaven/Unsplash servers on your behalf.
- What's sent is minimal: the id already visible in the page's own URL (a
  tweet status id, a Wallhaven wallpaper id) or nothing at all (Unsplash just
  builds a URL). No cookies or auth are attached — the fetch runs from the
  background service worker, not the page.
- Toggling **Resolve exact originals (network requests)** in Settings is the
  single switch for *automatic* resolution; see
  [Getting Started](./getting-started.md#settings).
- The per-item **"Get video"** button contacts the same host even with that
  setting off — it's an explicit, one-item request the user just triggered by
  clicking it, not passive background collection.

## Adding a new resolver

1. Implement the `Resolver` interface (`src/extension/shared/resolvers/types.ts`):
   a `match(u, ctx)` guard and a synchronous, network-free `resolve(u, ctx)`
   that returns `MediaCandidate[]` (`[]` means "not mine / give up, try the
   next one").
2. Add it to `REGISTRY` in `src/extension/shared/resolvers/index.ts`, **before**
   `genericResolver` — order matters, since the first resolver to return a
   non-empty array wins.
3. If the exact original needs a network fetch, add the platform to
   `ResolvePlatform` (`src/types/index.d.ts`), attach a `resolveHint` from
   `resolve()`, and add a case to `resolveOriginal()`
   (`src/extension/shared/resolvers/network.ts`) — run any URL pulled from a
   response through `pinnedUrl()` before returning it.
4. A resolver that only needs DOM evidence (no network case at all) can skip
   step 3 entirely — see `wallhavenResolver` when it has extension evidence.

---

Related: [Collection Pipeline](./collection-pipeline.md) (the `resolve()`
registry and passive resolution) · [Deep Scan](./deep-scan.md) (merged results
carry the same hints) · [Architecture](./architecture.md) · [Download](./download.md).
