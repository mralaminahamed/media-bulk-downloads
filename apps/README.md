# `apps/` — deliverable applications

The runnable end-products of the monorepo. Each is a yarn workspace
(`workspaces: ["packages/*", "apps/*"]`) and composes the `@mbd/*` domain
packages under `../packages/` into something shippable.

| App                  | Path         | What it is                                                                                                                                                                                               | Imports                                      |
|----------------------|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------|
| **`@mbd/extension`** | `extension/` | The WXT Manifest-V3 browser extension (Chrome / Firefox / Edge live; Safari submitted, under review). `entrypoints/` (background, content scripts, MAIN-world sniffers, offscreen) + `extension/{background,content,popup,bubble,offscreen}`. | `@mbd/core`, `@mbd/storage`, `@mbd/platform` |

The app is the only place that touches `chrome.*` freely; everything reusable and
browser-agnostic lives in `../packages/`. Import direction is one-way:
**app → storage/platform → core**.

`safari-native/` is **not** a yarn workspace (no `package.json`) — it holds the
native macOS/iOS Xcode wrapper that hosts the Safari build (`-b safari`),
generated on macOS by Apple's `safari-web-extension-converter`. The Safari app is
**submitted to the Mac App Store and under review**; see `safari-native/README.md`.

## Build & run (from the repo root)

```bash
yarn dev            # Chrome dev (HMR) → apps/extension/.output/chrome-mv3
yarn build          # also :firefox, :edge, :all
yarn build:safari   # Safari → apps/extension/.output/safari-mv3
yarn zip            # store zips in apps/extension/.output/
```

Load unpacked from `apps/extension/.output/chrome-mv3` (or `firefox-mv3`). Safari
runs through the native wrapper — see `safari-native/README.md`.

## More

- Monorepo layout & rationale — `../docs/architecture/monorepo-restructure.md`
- Guides — `../docs/website/src/content/docs/` (architecture, collection-pipeline, download, badge, bubble)
- Full dev/build/debug workflow — the `extension-dev` skill (`.claude/skills/extension-dev/`)
- Safari (submitted, under review) — `safari-native/README.md`, `../docs/store-submissions/SAFARI_APPSTORE.md`
