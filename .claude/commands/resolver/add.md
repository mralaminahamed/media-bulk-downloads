---
description: Build a new site/CDN resolver end to end — recon, implement (TDD), wire, verify, benchmark, ship.
argument-hint: "<site or a public post/page URL>   e.g.  https://bunkr.si/a/…"
---

Add media-resolver support for: **$ARGUMENTS**. Load the `adding-a-resolver` skill
(contract + `references/recon-and-cdn.md` + `references/worked-example.md`).

1. **Recon first** (`/resolver:recon`) — confirm a bigger original is reachable and
   pick the mechanism: **CDN rule** (`imageUrl.ts`), **DOM-`srcset`-widest**,
   **page-JSON reader**, **Phase-2 fetch** (`resolvers/network.ts` +
   `ResolvePlatform`), or **sniffer** (MAIN-world). No upgrade path over generic →
   **stop and close** (don't build a no-op).
2. **TDD** (use `superpowers:test-driven-development`) — failing test first
   (`packages/core/tests/resolvers/sites/<site>.test.ts`, calling `resolve()`
   with a fabricated DOM/JSON), then implement:
   - resolver → `packages/core/src/resolvers/sites/<site>.ts` (exact-`===` `match`,
     `hosts?` bucket, synchronous network-free `resolve` → `MediaCandidate[]` or
     `[]`), registered in `resolvers/index.ts` **before** `genericResolver`;
   - or a CDN rule in `imageUrl.ts` (`{match, rewrite}`, curl-verified bigger);
   - or an embed via `content/collect.ts` + a `network.ts` case.
   Shape-validate page-controlled ids, host-pin fetched URLs, `data:image` only for
   base64, **minimal comments** (repo convention).
3. **Wire + test collection** if it needs DOM/embed handling
   (`apps/extension/tests/unit/extension/content/collect.test.ts`).
4. **Verify** — `/gate`, then `superpowers:verification-before-completion` before
   claiming done. Optionally the live `window.__bench` probe (strip query strings).
5. **Review + document + ship** — dispatch the **`resolver-reviewer`** agent on the
   diff and fix any 🔴/🟠 findings. Then add a README supported-sites row +
   `docs/website/src/content/docs/benchmark/changelog.md` entry + `CHANGELOG.md` `[Unreleased]` line; `/ship`
   as `feat(resolver): add <site> …`.
