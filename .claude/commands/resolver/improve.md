---
description: Audit + update/fix an existing resolver (site or sniffer) — re-verify against the live site, close gaps, TDD the fix, ship.
argument-hint: "<resolver name or host>   e.g.  onedio | instagram | x-media-sniff"
---

Improve the existing resolver/sniffer: **$ARGUMENTS**. Load the `adding-a-resolver`
skill first (contract + `references/`).

1. **Locate** — `packages/core/src/resolvers/sites/<name>.ts` (site resolver / page
   reader) or `resolvers/sniffers/<name>*` (MAIN-world extractor), its registry
   entry (`resolvers/index.ts`) or `ResolvePlatform` case (`resolvers/network.ts`),
   and its tests (`packages/core/tests/resolvers/…/<name>.test.ts`). Read them.
2. **Re-verify live** (sites drift — Sabq/UOL did). `/resolver:recon`-style: curl a
   current public page, confirm the host/path shape, JSON keys, or `srcset` the
   resolver depends on still exist and still point at a bigger original. For a
   **sniffer**: confirm the page still fetches the media JSON/manifest the wrapper
   expects, and the `postMessage` `source:'mbd-…'` discriminator + gates still match
   on **both** ends.
3. **Diagnose** (for a reported failure, `superpowers:systematic-debugging`) —
   broken match (host/path/regex moved), stale endpoint/key, a missed
   larger rendition, a downgrade, a fail-open that should fail closed, or a
   host-pin/SSRF gap. If the site changed so there's no upgrade path left, the right
   move may be to **narrow or remove** it — say so.
4. **Fix TDD** (`superpowers:test-driven-development`) — failing test first (call
   `resolve()`, or the sniffer's extractor), then make it pass. Network-free,
   shape-validated, host-pinned, minimal comments.
5. **Verify** — `/gate`, then `superpowers:verification-before-completion` (+ a
   collection-wiring test if wiring changed).
6. **Record + ship** — `docs/benchmark/changelog.md` (what/why) + the README row if
   behavior changed + a `CHANGELOG.md` `[Unreleased]` entry; then `/ship` as
   `fix(resolver): …` (or `feat` if it now covers more).
