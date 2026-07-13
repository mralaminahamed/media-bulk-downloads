---
name: performance
description: Keep this extension fast and bounded — content-script bundle size, popup grid rendering, deep-scan limits, remote size enrichment, and network-free collection. Use when the popup feels slow, a page-heavy site lags, memory grows, or when adding work to the content script / collection / deep scan.
---

# Performance

The content script runs on every `<all_urls>` page and the popup can list large
media sets, so cost is bounded deliberately.

## Known costs & the guardrails

- **Content-script size (~300 KB).** WXT bundles the on-page bubble into the
  content script; it still only *mounts* when `bubbleEnabled`, but it parses on
  every page. Lazy-chunking the bubble back into a web-accessible chunk is a known
  follow-up — don't add more eager weight to `content.ts`.
- **Collection is network-free.** `collectMedia()` reads the DOM only; never add a
  fetch to the scan path. The one exception is opt-in `resolveOriginals`, which
  runs in the background worker.
- **`collectMedia()` scans every element** for CSS backgrounds
  (`querySelectorAll('*')` + `getComputedStyle`). It's the dominant cost on huge
  pages and re-runs each deep-scan round — keep it lean; don't add per-element work.
- **Deep scan is bounded** (`packages/core/src/collection/deepScan.ts`): `maxScrolls: 40`, `maxMs: 20000`,
  `maxItems: 1000` (enforced inside `merge()`), `idleRounds: 3`; `waitForQuiet` has
  a 2s hard cap. Keep these ceilings.
- **Remote size enrichment** (`getImageFileSize`, popup only, user-initiated) is
  capped at concurrency 6 and guarded by a generation counter so a rescan cancels
  stale writes. Videos/audio are never probed.
- **Dedup by src** everywhere (a `Set`) so lists don't balloon.
- **Durable IDB mirror writes are fire-and-forget.** `durableSet` returns the
  `chrome.storage.local` promise and detaches the IndexedDB write (`packages/storage/src/idb.ts`),
  so persistence never blocks a save. Keep it that way — awaiting the mirror would
  serialize every history/queue write on IDB latency.

## When touching the popup grid

- Very large sets aren't windowed yet — list virtualization is a deferred
  optimization. Avoid heavy per-tile work; key grid tiles by `src` (stable) so
  filtering/reordering doesn't remount `LoadingImage`.
- Async paths (resolution, enrichment) use generation guards — preserve them so a
  newer scan cancels older writes.

## References

- Deep scan (this repo) — `packages/core/src/collection/deepScan.ts`, `docs/guides/deep-scan.md`
- Collection pipeline — `docs/guides/collection-pipeline.md`
- MV3 service worker lifecycle — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- `getComputedStyle` cost — https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle
- React list keys — https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key

Related skill: `extension-dev` (MV3 constraints) — optional; this skill stands alone.
