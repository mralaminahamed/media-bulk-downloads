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
- **Sankaku** (#286, deferred) — originals are signed-token + login-gated; a passive
  preview→original rewrite would 404. Out of the no-auth, network-free-by-default model.
- **preview.redd.it** — signed (left byte-identical by design, verified live).
- **Guardian** stays open (above); Giphy / Tenor **moved to Resolved** (2026-07-15) — the
  downsized-variant upgrade is now a shipped Tier-1 CdnRule (see the
  [benchmark changelog](./changelog.md)).
