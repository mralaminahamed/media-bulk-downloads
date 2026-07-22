---
title: "Popup & deep-scan performance"
description: "Popup grid render and deep-scan collection performance notes."
---

> Part of the [Collection Benchmark](/media-bulk-downloads/benchmark/overview/).

## J. Popup grid render performance

**P1 (2026-07-12):** the popup's own results grid (`ImageList.tsx`) now sets
`content-visibility: auto` + a per-axis `auto <length>` `contain-intrinsic-size`
on every tile `<figure>` (falling back to a `thumbnailSize`-square box before first paint, then self-correcting to the tile's real measured height — thumbnail plus figcaption — once it has actually
rendered), so the browser skips layout/paint for offscreen tiles instead of rendering the whole grid up front. Manual check at ~1000 items: the grid stays responsive to scroll with only the
near-viewport tiles doing paint work; on-screen tile appearance is unchanged.

## K. Deep-scan collection performance

**P2 (2026-07-12):** deep-scan rounds after the seed rescan only
`MutationObserver`-reported subtrees (full walk on the seed and on the busy-page hard cap); no change to media collected.

**P3 (2026-07-12):** deep scan now seeds its settle-time and scroll-depth from a per-host memory of the previous run (local-only, on by default), so a repeat visit to the same site converges without
re-learning from scratch; first-visit behavior on a new host is unchanged.
