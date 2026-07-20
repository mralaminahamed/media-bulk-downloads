---
description: Audit + update/fix an existing resolver (site or sniffer) — re-verify it against the live site, close gaps, TDD the fix, ship.
argument-hint: "<resolver name or host>   e.g.  onedio   |   instagram   |   x-media-sniff"
---

Improve the existing resolver/sniffer: **$ARGUMENTS**. Load the `adding-a-resolver`
skill first (contract + patterns + `references/`).

1. **Locate it** — `packages/core/src/resolvers/sites/<name>.ts` (a site resolver /
   page reader) or `resolvers/sniffers/<name>*` (a MAIN-world extractor), its
   registry entry (`resolvers/index.ts`) or `ResolvePlatform` case
   (`resolvers/network.ts`), and its tests
   (`packages/core/tests/resolvers/…/<name>.test.ts`). Read them.
2. **Re-verify against the live site** (sites drift — Sabq/UOL did). `/recon`-style:
   curl a current public page, confirm the host/path shape, the JSON keys, or the
   `srcset` the resolver depends on still exist and still point at a bigger original.
   For a **sniffer**: confirm the page still fetches the media JSON/manifest the way
   the wrapper expects, and the `postMessage` `source:'mbd-…'` discriminator + gates
   still match on both ends.
3. **Diagnose** — a broken match (host/path/regex moved), a stale endpoint/key, a
   missed larger rendition, a downgrade, a fails-open path that should fail closed,
   or a host-pin/SSRF gap. If the site changed so there's no longer an upgrade path,
   the right move may be to **narrow or remove** it — say so.
4. **Fix TDD** — add/adjust a failing test first (call `resolve()` directly, or the
   sniffer's extractor), then make it pass. Keep it network-free + shape-validated +
   host-pinned. Match the repo's minimal-comment style.
5. **Verify** — `/gate` (type-check + lint + test + build). Add a collection-wiring
   test if the change touches wiring.
6. **Record + ship** — update `docs/benchmark/changelog.md` (what changed / why) and
   the README supported-sites row if behavior changed; then `/ship` as
   `fix(resolver): …` (or `feat` if it now covers more). Add a `CHANGELOG.md`
   `[Unreleased]` entry (product change).
