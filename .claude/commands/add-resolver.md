---
description: Build a new site/CDN resolver end to end — recon, implement (TDD), wire, verify, benchmark, ship.
argument-hint: "<site or a public post/page URL>   e.g.  https://bunkr.si/a/…"
---

Add media-resolver support for: **$ARGUMENTS**. Load the `adding-a-resolver` skill
(contract + `references/recon-and-cdn.md` + `references/worked-example.md`).

1. **Recon first** (`/recon`): confirm a bigger original is reachable and pick the
   mechanism — **CDN rule** (`imageUrl.ts`), **DOM-`srcset`-widest** resolver,
   **page-JSON reader**, **Phase-2 network fetch** (`resolvers/network.ts` +
   `ResolvePlatform`), or **sniffer** (MAIN-world). If there's no upgrade path over
   the generic pipeline, **stop and close it** — don't build a no-op.
2. **TDD** — write the failing test first
   (`packages/core/tests/resolvers/sites/<site>.test.ts`, calling `resolve()`
   directly with a fabricated DOM/JSON), then implement:
   - a new resolver: `packages/core/src/resolvers/sites/<site>.ts` (exact-`===`
     `match`, `hosts?` bucket, synchronous network-free `resolve` returning
     `MediaCandidate[]` or `[]`), registered in `resolvers/index.ts` **before**
     `genericResolver`;
   - or a CDN rule in `imageUrl.ts` (`{match, rewrite}`, curl-verified bigger);
   - or an embed wired via `content/collect.ts` + a `network.ts` case.
   Shape-validate page-controlled ids, host-pin fetched URLs, `data:image` only for
   base64, minimal comments.
3. **Wire + test collection** if it needs DOM/embed handling
   (`apps/extension/tests/unit/extension/content/collect.test.ts`).
4. **Verify** — `/gate`. Optionally the live `window.__bench` collection probe
   (strip query strings from output).
5. **Document + ship** — add a README supported-sites row, a
   `docs/benchmark/changelog.md` entry, a `CHANGELOG.md` `[Unreleased]` line; then
   `/ship` as `feat(resolver): add <site> …`.
