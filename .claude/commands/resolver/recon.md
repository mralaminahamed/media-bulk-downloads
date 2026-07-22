---
description: Recon-probe one candidate site for a resolver — is there an upgrade path the generic pipeline misses, or close it?
argument-hint: "<site or public post/page URL>   e.g.  bunkr.si   |   https://…/album/…"
allowed-tools: Bash(curl:*), Bash(grep:*), Bash(rg:*), Bash(ls:*), Skill
---

Recon the candidate for a new media resolver: **$ARGUMENTS**. Invoke the
`adding-a-resolver` skill first (`references/recon-and-cdn.md` has the full recipe).
**Decide build-or-close — do not write a resolver here.**

1. **Not already covered?** grep `packages/core/src/resolvers/sites/`,
   `resolvers/index.ts`, `resolvers/network.ts` (`ResolvePlatform`), and
   `collection/imageUrl.ts` (CDN rules) for the host/brand. Covered → close.
2. **Probe live** — curl a real public page (browser UA, `--max-time 20`); extract
   its media CDN URLs.
3. **Upgrade path?** Is a **bigger original reachable** than the default rendition?
   Byte-compare with `curl -o /dev/null -w '%{http_code} %{size_download}'`. Watch:
   per-size **signed filenames** (can't rewrite — read the widest `srcset`), the
   generic pipeline already winning (`bestSrcsetUrl` takes the widest `srcset`;
   `upgradeToOriginal` covers ~60 CDN families), signed/already-original URLs.
4. **Verdict:**
   - **Close** — no reachable upgrade over generic → say why; record in `docs/website/src/content/docs/benchmark/`.
   - **CDN rule** — a plain path/param rewrite curl-verifies bigger → smallest fix in `imageUrl.ts`.
   - **Resolver** — must read DOM/JSON (page-JSON reader, DOM-`srcset`-widest, Phase-2 fetch, or sniffer) → outline the mechanism.

Never log tokens/query strings. Report the verdict + evidence (byte comparisons,
URL shape). Build → `/resolver:add`. Close → note the reason and stop.
