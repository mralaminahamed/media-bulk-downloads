---
description: Search for new sites worth adding resolver support for — survey coverage, propose prioritized candidates with a plausible upgrade path.
argument-hint: "(optional) a category or hint — e.g. 'album hosts', 'video', 'anime art'"
---

Find candidate sites to add media-resolver support for$ARGUMENTS. Discovery only —
each candidate then goes through `/recon` before building.

First load the `adding-a-resolver` skill (the recon-first + close-if-no-upgrade
discipline). Then:

1. **Map current coverage** so you don't propose duplicates:
   - `ls packages/core/src/resolvers/sites/` (dedicated resolvers/readers),
   - the `REGISTRY` in `resolvers/index.ts`,
   - the `ResolvePlatform` union in `packages/core/src/types.ts` (Phase-2 network),
   - CDN families with rules in `collection/imageUrl.ts`,
   - and `docs/benchmark/gaps.md` (already probed + closed as unupgradeable).
2. **Propose candidates NOT covered**, grouped by category (social / video / image
   boards / art+stock / album hosts / audio / wallpaper / NSFW). For each, state:
   the media gap the **generic pipeline** misses, the likely mechanism (CDN rule /
   DOM-`srcset`-widest / page-JSON reader / Phase-2 fetch / sniffer), and a rough
   feasibility. Prefer sites where a bigger original is plausibly reachable — album
   hosts and page-JSON sites tend to be real gaps; flat-`srcset` sites usually
   aren't (generic already wins).
3. **Rank** by popularity × feasibility × (generic-pipeline-failure). Note anything
   already handled by a CDN rule (don't propose it as new).
4. Output a short prioritized table (site · category · gap · proposed mechanism ·
   feasibility) and flag that each needs a live `/recon` to confirm before building.
   Be honest — recommend closing categories where the generic pipeline already wins.

Do not build anything here; offer to `/recon` the top pick next.
