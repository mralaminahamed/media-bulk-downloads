---
title: "Collection Benchmark"
---

Functional benchmark of the media-collection engine against popular, high-traffic websites. It measures what the extension's **actual** `collectMedia()` pipeline (deep DOM extraction → native
resolvers → URL de-proxy → CDN upgrade → dedup)
discovers on real pages.

> For the plain-language summary of these results, see the
> [Feature one-pager](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/docs/marketing/one-pager.md).

## Contents

This benchmark is split across focused files under [`benchmark/`](./):

| File                                                | Contents                                                                    |
|-----------------------------------------------------|-----------------------------------------------------------------------------|
| [Method & reproduction](./methodology.md) | How coverage is measured, run dates, and how to reproduce it                |
| [Live-verified results](./results.md)     | §A / A-2 / B — per-site collection vs upgrade, verified new-CDN rules       |
| [Coverage matrix](./coverage-matrix.md)   | §C — the CDN-family → sites table                                           |
| [Gaps found](./gaps.md)                   | §D — what is still open (signed / already-original)                         |
| [Resolver candidates](./candidates.md)    | Un-supported sites worth a resolver — validated live status + recon verdict |
| [Benchmark changelog](./changelog.md)     | Shipped upgrade rules & resolver fixes this benchmark drove                 |
| [Caveats](./caveats.md)                   | §E — how to read the numbers                                                |
| [Accuracy studies](./accuracy.md)         | §G / H / I — Facebook / Instagram / Threads original-media accuracy         |
| [Performance](./performance.md)           | §J / K — popup grid render + deep-scan timings                              |

The user-facing release history lives in the top-level [CHANGELOG.md](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/CHANGELOG.md).

## Coverage model — why the engine is broad *and* adaptive

Support is delivered in **four escalating tiers**, each a fallback for the last, so the engine is "wildly supportive" without a per-site rule for every site:

1. **Generic DOM collection (host-agnostic).** `collectMedia()` reads every `<img>` /
   `<video>` / `<audio>` / `srcset` / `<picture>` / `og:*` / lazy `data-src` on the page. Any site that mounts its media as a real element with a real URL is collected with **zero per-site code** —
   this is the majority, including the whole plain-`<img>`
   reader class (most manga readers, most image galleries; live-proved on **weebcentral**:
   21 chapter-page originals collected with no dedicated resolver — see
   [candidates.md](./candidates.md)).
2. **Adaptive deep-scan.** For lazy/virtualized/infinite feeds, the bounded scroll loop (`collection/deepScan.ts`) surfaces what isn't yet in the DOM — with an **EMA-adaptive quiet window**,
   yield-driven scroll step, warm-start from a host's learned settle time, and "keep-going-when-rich" cap extension. It adapts to each page's cadence rather than using fixed timings.
3. **90+ host-agnostic CDN upgrade rules** (`collection/imageUrl.ts`) + **31 dedicated resolvers** (`resolvers/`) rewrite a collected thumbnail to its original.
4. **Opt-in network tier + MAIN-world sniffers** for the hard cases — SPAs that hide the original behind canvas/blob/JS (MangaDex), signed CDNs, or player metadata (HLS/DASH, Twitter/Vimeo/Twitch/…),
   each SSRF-host-pinned and read-only.

**Consequence for "unsupported" sites:** a site absent from the coverage matrix is usually *already collected* by tier 1–2; a dedicated resolver (tier 3–4) is warranted **only** when the original is
hidden from the DOM. This is the maturity check — breadth comes from the generic tiers, precision from the dedicated ones, and every tier is covered by the ~3,000-test suite across
Chrome/Firefox/Edge/Safari.
