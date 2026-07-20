---
description: Recon-probe a candidate site for a new resolver — is there an upgrade path the generic pipeline misses, or should it be closed?
argument-hint: "<site or public post/page URL>   e.g.  bunkr.si   or   https://…/album/…"
---

Recon the candidate site for a new media resolver: **$ARGUMENTS**

First invoke the `adding-a-resolver` skill (the recon-first discipline). Then, for
this target, decide **build or close** — do NOT write a resolver yet.

1. Confirm it isn't already covered: grep `packages/core/src/resolvers/sites/`,
   `resolvers/index.ts`, and `collection/imageUrl.ts` (CDN rules) for the host/brand.
   Already handled → close.
2. curl a real public post/album/media page (browser UA, `--max-time 20`). Extract
   the media CDN URLs it serves.
3. Find the upgrade path: is a **bigger original reachable** than what the page shows
   by default? Compare bytes (small variant vs candidate original) with `curl -o
   /dev/null -w '%{http_code} %{size_download}'`. Watch for:
   - per-size **signed filenames** (can't rewrite — must read the widest listed),
   - the generic pipeline already winning (`bestSrcsetUrl` takes the widest
     `srcset`; `upgradeToOriginal` covers ~60 CDN families),
   - **signed / already-original** URLs (nothing to upgrade — close).
4. **Verdict:**
   - **Close** — no reachable upgrade over generic → say so, note why, done.
   - **CDN rule** — a plain path/param rewrite curl-verifies bigger → smallest fix
     in `imageUrl.ts`.
   - **Resolver** — must read DOM/JSON (page-JSON reader, DOM-srcset-widest, or a
     Phase-2 network fetch) → outline the mechanism.

Never send tokens/query strings to logs. Report the verdict + evidence (byte
comparisons, URL shape). If it's a build, offer to proceed TDD-style; if a close,
record the reason in `docs/benchmark/`.
