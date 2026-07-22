# @mbd/platform — Browser Capability Seam

The **browser-capability seam**: capability *contracts* and runtime feature
detection, kept separate from any concrete implementation. It lets the rest of
the code target a capability instead of a specific browser, so degraded targets
(Safari, Firefox) can fall back cleanly.

## Public API

| Import                        | What                                                          |
|-------------------------------|---------------------------------------------------------------|
| `@mbd/platform`               | Barrel — the contracts + `detectCapabilities()`               |
| `@mbd/platform/capabilities`  | `detectCapabilities()` runtime feature probe                  |
| `@mbd/platform/downloader`    | `Downloader` contract (save bytes / URL)                      |
| `@mbd/platform/notifier`      | `Notifier` contract (finish toasts)                           |
| `@mbd/platform/header-rules`  | `HeaderRules` contract (hotlink-403 Referer retry)            |
| `@mbd/platform/stream-capture`| `StreamCaptureHost` contract (HLS/DASH assembly host)         |

## Boundary

**Contracts + detection only — no implementations.** The concrete Chrome /
Firefox / Safari implementations live in the app
(`apps/extension/src/extension/platform/`). No runtime dependencies.

> Status: the seam exists but is **not yet wired into the app** — the background
> still calls `chrome.*` directly. Routing it through these contracts +
> `selectPlatform()` is a tracked follow-up (see the
> [monorepo-restructure](../../docs/architecture/monorepo-restructure.md) record).

## Tests

Vitest project under `tests/`. Run from the repo root:

```bash
yarn test
```

## More

See the [Architecture guide](../../docs/website/src/content/docs/how-it-works/architecture.md) for where the
seam sits in the surface/module map.
