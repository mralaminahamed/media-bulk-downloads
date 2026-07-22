# @mbd/core — Domain Core

Browser-agnostic domain library for **Media Bulk Downloads**: media collection,
per-site resolvers, HLS/DASH byte-logic, and the shared type contracts. **Zero
`chrome.*` APIs** — everything here is pure and runs anywhere (the extension, a
test, a Node script).

## Public API

Consumed as TypeScript source (no build step) via the package `exports`:

| Import                       | What                                                             |
|------------------------------|------------------------------------------------------------------|
| `@mbd/core`                  | Barrel of the stable surface                                     |
| `@mbd/core/types`            | Shared types (`MediaItem`, `ImageInfo`, `ChromeMessage`, …)      |
| `@mbd/core/collection/*`     | Discovery, de-proxy, CDN-upgrade, dedup, filters, deep-scan      |
| `@mbd/core/resolvers`        | Resolver `REGISTRY` + host-indexed `resolve()` dispatch          |
| `@mbd/core/resolvers/*`      | Individual resolvers, sniffers, and the opt-in `network.ts` tier |
| `@mbd/core/net/*`            | Low-level network helpers (SSRF guard, fetch wrappers)           |
| `@mbd/core/download/*`       | ZIP / base64 / format-convert / stream byte-logic                |

## Layout

```
src/
├── collection/   # DOM discovery + URL upgrading (network-free)
├── resolvers/    # per-site resolvers (+ sniffers/) and the network tier
├── download/     # zip · base64 · convert · stream assembly byte-logic
├── net/          # fetch/XHR helpers, SSRF guard
└── types.ts      # shared contracts
```

## Boundary

Browser-agnostic. No `chrome.*`, no DOM-mount code, no persistence — those live
in [`@mbd/storage`](../storage/README.md), [`@mbd/platform`](../platform/README.md),
and the app. Runtime deps are small pure-in-browser helpers: `fflate`, `mp4box`,
`@breezystack/lamejs`.

## Tests

Vitest project under `tests/` (with `fixtures/`). Run from the repo root:

```bash
yarn test          # all packages + the app
```

## More

See the [Architecture guide](https://mralaminahamed.github.io/media-bulk-downloads/how-it-works/architecture/),
[Collection Pipeline](https://mralaminahamed.github.io/media-bulk-downloads/how-it-works/collection-pipeline/), and
[Resolve Originals](https://mralaminahamed.github.io/media-bulk-downloads/how-it-works/resolve-originals/) for the full design —
this README is a map, those are the source of truth.
