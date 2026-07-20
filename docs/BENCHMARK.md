# Collection Benchmark

Functional benchmark of the media-collection engine against popular, high-traffic
websites. It measures what the extension's **actual** `collectMedia()` pipeline
(deep DOM extraction → native resolvers → URL de-proxy → CDN upgrade → dedup)
discovers on real pages.

> For the plain-language summary of these results, see the
> [Feature one-pager](./marketing/one-pager.md).

## Contents

This benchmark is split across focused files under [`benchmark/`](./benchmark/):

| File | Contents |
|------|----------|
| [Method & reproduction](./benchmark/methodology.md) | How coverage is measured, run dates, and how to reproduce it |
| [Live-verified results](./benchmark/results.md) | §A / A-2 / B — per-site collection vs upgrade, verified new-CDN rules |
| [Coverage matrix](./benchmark/coverage-matrix.md) | §C — the CDN-family → sites table |
| [Gaps found](./benchmark/gaps.md) | §D — what is still open (signed / already-original) |
| [Resolver candidates](./benchmark/candidates.md) | Un-supported sites worth a resolver — validated live status + recon verdict |
| [Benchmark changelog](./benchmark/changelog.md) | Shipped upgrade rules & resolver fixes this benchmark drove |
| [Caveats](./benchmark/caveats.md) | §E — how to read the numbers |
| [Accuracy studies](./benchmark/accuracy.md) | §G / H / I — Facebook / Instagram / Threads original-media accuracy |
| [Performance](./benchmark/performance.md) | §J / K — popup grid render + deep-scan timings |

The user-facing release history lives in the top-level [CHANGELOG.md](../CHANGELOG.md).
