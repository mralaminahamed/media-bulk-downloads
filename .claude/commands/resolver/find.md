---
description: Search for new sites worth adding resolver support for — survey coverage, propose prioritized candidates.
argument-hint: "(optional) a category or hint — e.g. 'album hosts', 'video', 'anime art'"
allowed-tools: Bash(ls:*), Bash(grep:*), Bash(rg:*), Skill
---

Find candidate sites to add media-resolver support for$ARGUMENTS. **Discovery
only** — each candidate then goes through `/resolver:recon` before building.

Load the `adding-a-resolver` skill first (recon-first + close-if-no-upgrade
discipline). Then:

1. **Map current coverage** (don't propose duplicates):
   - `ls packages/core/src/resolvers/sites/`,
   - `REGISTRY` in `resolvers/index.ts`,
   - `ResolvePlatform` in `packages/core/src/types.ts` (Phase-2 network),
   - CDN families in `collection/imageUrl.ts`,
   - `docs/website/src/content/docs/benchmark/gaps.md` (already probed + closed as unupgradeable).
2. **Propose uncovered candidates**, grouped by category (social / video / image
   boards / art+stock / album hosts / audio / wallpaper / NSFW). For each: the media
   gap the **generic pipeline** misses, the likely mechanism (CDN rule /
   DOM-`srcset`-widest / page-JSON reader / Phase-2 fetch / sniffer), and rough
   feasibility. Album hosts + page-JSON sites tend to be real gaps; flat-`srcset`
   sites usually aren't (generic already wins).
3. **Rank** by popularity × feasibility × generic-pipeline-failure. Flag anything a
   CDN rule already handles (don't list as new).
4. Output a short prioritized table (site · category · gap · mechanism ·
   feasibility). Be honest — recommend closing categories where generic already wins.

Don't build here. To validate fast, **fan out the `resolver-recon` agent over the
top candidates in parallel** (one per site) — each returns a build-or-close verdict
with byte evidence — then report which survived. Build a survivor → `/resolver:add`.
