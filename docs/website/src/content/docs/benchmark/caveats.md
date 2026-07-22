---
title: "Caveats"
---

> Part of the [Collection Benchmark](./overview.md).

## E. Caveats

- Numbers vary run-to-run (feeds, A/B layouts, virtualization, consent state, SPA hydration timing). Treat them as representative, not exact — e.g. YouTube's home rendered 0 thumbnails logged-out in
  this capture.
- **[C]** rows are covered by the *same CDN rule* verified on a live site, or verified against a real sampled URL by HTTP/`Image()` load (thumbnail vs rewritten original) — not necessarily
  live-injected in this run (§A-2).
- **[A]** rows are login/bot-gated; logged-out they return little. The extension still works there when the user is logged in.
- This measures **discovery + URL upgrading**. §A is network-free (a rewritten original isn't fetched during collection); §A-2 additionally loaded each rewritten URL to confirm it resolves and is
  larger. Phase-2 opt-in resolution (e.g. Twitter mp4, Wallhaven ext, Unsplash `/download`, and ~20 other opt-in hosts) runs only when enabled.
