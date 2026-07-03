# Collection Benchmark

Functional benchmark of the media-collection engine against popular, high-traffic
websites. It measures what the extension's **actual** `collectMedia()` pipeline
(deep DOM extraction + URL de-proxy + CDN upgrade + dedup) discovers on real
pages.

## Method

- The real `src/extension/collect.ts` (and its `extract.ts` / `imageUrl.ts` /
  `mediaType.ts` dependencies) was bundled unchanged into an IIFE and injected
  into each page, then run once. No source was mocked or altered.
- **Read-only and network-free** — the collector only reads the DOM and rewrites
  URL strings. Nothing was fetched, clicked, or submitted.
- **Logged-out**, **first viewport only** — **Deep scan was not run**. Counts are
  the baseline a normal scan sees; on infinite-scroll feeds the real totals are
  much higher after Deep scan.
- `upgraded` = items whose URL was rewritten to an original or paired with a
  gallery thumbnail (i.e. carry a `thumbnailSrc`).
- Sample URLs below are shown as `origin + path` (query stripped) for privacy.

Run date: 2026-07-03. Chrome (Manifest V3).

## Results

| Site               | Page                    | Total | Images | Upgraded | With dims | data: URIs | Notable CDNs                           |
|--------------------|-------------------------|------:|-------:|---------:|----------:|-----------:|----------------------------------------|
| Wikipedia          | `/wiki/Cat`             |   113 |    113 |   **92** |        54 |          0 | upload.wikimedia.org                   |
| Unsplash           | `/s/photos/mountain`    |   152 |    152 |       40 |       131 |         20 | images.unsplash.com, plus.unsplash.com |
| YouTube            | home (logged-out)       |    47 |     47 |       26 |        26 |          8 | i.ytimg.com, yt3.ggpht.com             |
| Allbirds (Shopify) | `/collections/mens`     |    83 |     83 |    **0** |        76 |          0 | www.allbirds.com/cdn/shop              |
| Allbirds (post-fix)| `/collections/mens`     |    79 |     79 |   **75** |        74 |          0 | www.allbirds.com/cdn/shop              |
| Reddit             | `old.reddit.com/r/pics` |    50 |     50 |       20 |        26 |          0 | i.redd.it, preview.redd.it             |
| Wallhaven          | `/latest`               |    90 |     90 |    **0** |        89 |          0 | th.wallhaven.cc (thumbnails only)      |

## What the engine got right (confirmed live)

- **Wikimedia path upgrade** — `/wikipedia/…/thumb/9/94/X.svg/40px-X.svg.png` →
  original `/wikipedia/…/9/94/X.svg`. 92 of 113 items upgraded to full assets.
- **Imgix / Unsplash query upgrade** — resize params (`w`,`h`,`fit`,`q`,…)
  stripped from `images.unsplash.com` to reach the original.
- **YouTube thumbnails** — `i.ytimg.com/vi/<id>/hq720.jpg` →
  `…/maxresdefault.jpg`; avatar `yt3.ggpht.com/…=s88-c-k-…` → `…=s0` (full size).
- **Gallery `<a href>` links** — on Reddit, post links to the direct image were
  surfaced as originals (`i.redd.it/<id>.jpeg`) while the smaller preview stayed
  as the thumbnail. This is the lightbox/gallery pattern working on a real site.
- **Signed-host posture** — `preview.redd.it` (signed) URLs were collected
  **byte-identical**, never query-stripped. Exactly the conservative behavior the
  design requires (stripping their signature would 403).
- **Dimensions & dedup** — dimensions were parsed from URL size tokens where
  present (131/152 on Unsplash, which carries `w=`/`h=`), and duplicate
  candidates (srcset variants, lazy attrs) collapsed to single items via
  dedup-on-upgraded-original.
- **data: URIs** — inline SVG/icons collected as base64 items (20 on Unsplash,
  8 on YouTube) without any network access.

## Gaps found → fixed

1. **Modern Shopify on the store's own domain (Allbirds: 0 upgraded).** ✅ Fixed.
   Newer stores serve from `www.<store>.com/cdn/shop/…?width=N` (own hostname +
   `?width=` query), not `cdn.shopify.com` + `_WxH`. The Shopify rule now also
   matches any `/cdn/shop/` path and drops `width`/`height`/`crop`/`pad_color`.
   **Re-benchmarked Allbirds: 0 → 75 of 79 upgraded.**

2. **`plus.unsplash.com` not upgraded.** ✅ Fixed — the Unsplash matcher now covers
   `images.` and `plus.unsplash.com`, both added to the media-host set.

3. **Wallhaven: 0 upgraded (thumbnails only).** ⏳ Needs a specialized resolver.
   `th.wallhaven.cc/small/<ab>/<id>.jpg` maps to `w.wallhaven.cc/full/<ab>/wallhaven-<id>.<ext>`,
   but the full-file extension (jpg/png/gif) isn't in the thumbnail URL — it must
   be read from the DOM (`span.png` badge on grids, or the `<img>` src on the
   `/w/<id>` page). A blind `.jpg` guess 404s on ~1/4 of wallpapers. Tracked for
   the **native resolvers** work — see
   [native resolver analysis](./native-resolvers-analysis.md).

4. **Baseline is first-viewport only.** Still true — feed pages (YouTube, Reddit,
   X) yield far more once **Deep scan** runs; a deep-scan benchmark is a follow-up.

## Caveats

- Numbers vary run-to-run (feeds, A/B layouts, consent state). Treat them as
  representative, not exact.
- Logged-out sessions show less media than an authenticated user would; sites
  behind login (Instagram, X/Twitter timelines) were not benchmarked here.
- This measures **discovery and URL upgrading**, not download success; a
  rewritten "original" URL is not fetched to confirm a 200 (network-free stance).

## Reproduce

Bundle the collector and inject it:

```bash
# entry: import { collectMedia } from '@/extension/collect'
# build an IIFE that exposes window.__collectMedia (Vite lib build or esbuild),
# inject into a page, then run collectMedia() and tally by kind / host / upgraded.
```

The exact pipeline under test is documented in
[Collection Pipeline](./guides/collection-pipeline.md).
