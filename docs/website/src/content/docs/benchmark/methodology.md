---
title: "Benchmark method & reproduction"
description: "How the collection benchmark is measured and reproduced — the real collector bundled and injected into live pages."
---

> Part of the [Collection Benchmark](/media-bulk-downloads/benchmark/overview/).

## Method

- The real `apps/extension/src/extension/content/collect.ts` (with `extract.ts` / `imageUrl.ts` /
  `mediaType.ts` / `resolvers/*`) is bundled unchanged into an IIFE (`esbuild --bundle --format=iife --alias:@=./apps/extension/src`), injected into the page, and run once. No source is mocked or
  altered.
- **Read-only and network-free** — the collector only reads the DOM and rewrites URL strings. Nothing is fetched, clicked, or submitted. (Opt-in Phase-2 network resolution — e.g. Twitter video mp4,
  Wallhaven ext, Unsplash `/download`, and
  ~20 other opt-in hosts — is not exercised here; those items show as pending
  `resolveHint`s.)
- **Logged-out**, **first viewport only** — **Deep scan not run**. Counts are the baseline a normal scan sees; feeds yield far more after Deep scan.
- `upgraded` = items whose URL was rewritten to an original / paired with a gallery thumbnail (carry a `thumbnailSrc`). `hints` = items tagged for opt-in network resolution (Twitter videos, Wallhaven
  bare thumbs, Unsplash, and ~20 other opt-in hosts).
- Sample URLs are shown as `origin + path` (query stripped) for privacy.

Run dates: 2026-07-03 / 2026-07-04 / **2026-07-05** / **2026-07-06** (§A re-run 2026-07-05 against the rule set as of that run — 32 CDN rules + 6 resolvers, historical as of the 2026-07-05/06 run;
Instagram resolver added 2026-07-06). The resolver registry has since grown to 31 entries (30 dedicated + a generic fallback — see [Collection Pipeline](/media-bulk-downloads/how-it-works/collection-pipeline/)); the
Threads, Bluesky, Arc XP and magnific resolvers were added just after this run and are mapped in §C rows 59–62, and the Mastodon and Booru resolvers were added 2026-07-11 (rows 65 and 67; Dailymotion,
row 66, is an embed-hook + Phase-2 path like Vimeo, so it is not a REGISTRY array entry). Many more shipped in the 2026-07-16→19 waves (TikTok, SoundCloud, Twitch, Patreon, Imgur, Pexels, Pornhub,
and ~20 others) and postdate the §A/§C snapshots below. §G/§H reflect the current Facebook/Instagram resolvers. Chrome (Manifest V3).

## F. Reproduce

Bundle the real collector and inject it:

```bash
# bench-entry.ts:  import { collectMedia } from '@/extension/content/collect';
#                  (window as any).__bench = () => tally(collectMedia());  // by kind/upgraded/hints
# Run from the repo root so the `@mbd/*` workspace packages resolve via node_modules.
esbuild bench-entry.ts --bundle --format=iife --alias:@=./apps/extension/src --outfile=bench.js
# Inject bench.js into a live page (first viewport, logged-out), scroll to trigger
# lazy-load, then read JSON.stringify(window.__bench()).
# Virtualized grids (X /media) mount ~20–24 tiles at once — wait before injecting.
```

Pipeline under test: [Collection Pipeline](/media-bulk-downloads/how-it-works/collection-pipeline/).
