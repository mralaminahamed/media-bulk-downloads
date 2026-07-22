---
title: "Gaps found"
description: "Sites the engine cannot upgrade further — signed or already-original CDNs still open."
---

> Part of the [Collection Benchmark](./overview.md).

## D. Gaps found

The running log of gaps this benchmark **resolved / corrected / reverted** — the shipped upgrade rules and resolver fixes — now lives in
[changelog.md](./changelog.md). This section tracks only what is still **open**.

Open (not upgradeable — signed / already-original):

- **Guardian** `i.guim.co.uk` — HMAC `s=<hex>` per width; any change → 401.
- **500px** `drscdn.500px.org` — signed URLs.
- **Sankaku** (#319, Tier-1 shipped) — a post's preview/sample/original tiers share the same md5 content-hash, so an opened post's already-signed original is collected and its thumbnail folds into it
  by md5 (passive, no-auth). Still open: grid-only originals need the opt-in authenticated Tier-2 (#319).
- **Xiaohongshu / RED** (#405, Tier-1 shipped) — a note's cover/detail renditions and every re-sign share the same fileId (`<bucket>/<token>`) in their signed
  `xhscdn.com` path, so RED media URLs are claimed, https-upgraded, and fold to one row by fileId (largest, displayed `WB_DFT` wins — passive, no-auth). Still open:
  video notes are out of scope; a larger/un-watermarked original would need the opt-in authenticated Tier-2.
- **Der Spiegel** (#380, resolver shipped — re-scoped from a CDN rule) — images on
  `cdn.prod.www.spiegel.de` are served as `<uuid>_w<width>_r<ratio>_…` at many widths/crops (separate filenames). A fixed-width rewrite 404s (max width is per-image bounded), so instead the resolver
  reads the element's `srcset` (and its
  `<picture>` `<source>`s) and returns the widest same-`<uuid>` rendition the page offers — every displayed thumbnail resolves to its full-size original, and all widths converge on one row. Only URLs
  the page listed (never a fabricated width), never a downgrade. No network, no URL rewrite.
- **Onedio** (#391, resolver shipped — re-scoped from a CDN rule) — images on
  `img-s1/2/3.onedio.com` use a `/id-<id>/rev-<n>/w-<W>/h-<H>/f-<fmt>/s-<sig>` path where each width is separately signed, so a dimension rewrite 404s (curl-verified). Instead the resolver reads the
  element's `srcset` (and its `<picture>` `<source>`s)
  and returns the widest same-`id` rendition already listed (300w→1200w, ~21 KB→170 KB), keyed on the image id so widths converge on one row. Only pre-signed URLs the page offered, never a downgrade.
  Sibling gaps closed as not-applicable: **Pinkvilla**
  (#382) serves each `<img>` at its full stored size with no `srcset` and no transform layer (suffix-strip 404s — the generic resolver already collects the full asset); **UOL** (#389,
  `conteudo.imguol.com.br`) references one size per photo (its
  `<picture>` switches format only, not width) and fabricated sizes 403 — nothing to upgrade past what is collected.
- **preview.redd.it** — signed (left byte-identical by design, verified live).
- **Guardian** stays open (above); Giphy / Tenor **moved to Resolved** (2026-07-15) — the downsized-variant upgrade is now a shipped Tier-1 CdnRule (see the
  [benchmark changelog](./changelog.md)).
