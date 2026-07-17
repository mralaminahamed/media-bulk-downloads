# Gaps found

> Part of the [Collection Benchmark](../BENCHMARK.md).

## D. Gaps found

The running log of gaps this benchmark **resolved / corrected / reverted** — the
shipped upgrade rules and resolver fixes — now lives in
[changelog.md](./changelog.md). This section tracks only what is
still **open**.

Open (not upgradeable — signed / already-original):
- **Guardian** `i.guim.co.uk` — HMAC `s=<hex>` per width; any change → 401.
- **500px** `drscdn.500px.org` — signed URLs.
- **Sankaku** (#319, Tier-1 shipped) — a post's preview/sample/original tiers share
  the same md5 content-hash, so an opened post's already-signed original is collected
  and its thumbnail folds into it by md5 (passive, no-auth). Still open: grid-only
  originals need the opt-in authenticated Tier-2 (#319).
- **Xiaohongshu / RED** (#405, Tier-1 shipped) — a note's cover/detail renditions and
  every re-sign share the same fileId (`<bucket>/<token>`) in their signed
  `xhscdn.com` path, so RED media URLs are claimed, https-upgraded, and fold to one
  row by fileId (largest, displayed `WB_DFT` wins — passive, no-auth). Still open:
  video notes are out of scope; a larger/un-watermarked original would need the
  opt-in authenticated Tier-2.
- **preview.redd.it** — signed (left byte-identical by design, verified live).
- **Guardian** stays open (above); Giphy / Tenor **moved to Resolved** (2026-07-15) — the
  downsized-variant upgrade is now a shipped Tier-1 CdnRule (see the
  [benchmark changelog](./changelog.md)).
