# `apps/` — deliverable applications

The runnable end-products of the monorepo. Each is a yarn workspace
(`workspaces: ["packages/*", "apps/*"]`) and composes the `@mbd/*` domain
packages under `../packages/` into something shippable.

| App                  | Path         | What it is                                                                                                                                                                                               | Imports                                      |
|----------------------|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------|
| **`@mbd/extension`** | `extension/` | The WXT Manifest-V3 browser extension (Chrome / Firefox / Edge). `entrypoints/` (background, content scripts, MAIN-world sniffers, offscreen) + `extension/{background,content,popup,bubble,offscreen}`. | `@mbd/core`, `@mbd/storage`, `@mbd/platform` |

The app is the only place that touches `chrome.*` freely; everything reusable and
browser-agnostic lives in `../packages/`. Import direction is one-way:
**app → storage/platform → core**.

## Build & run (from the repo root)

```bash
yarn dev            # Chrome dev (HMR) → apps/extension/.output/chrome-mv3
yarn build          # also :firefox, :edge, :all
yarn zip            # store zips in apps/extension/.output/
```

Load unpacked from `apps/extension/.output/chrome-mv3` (or `firefox-mv3`).

## More

- Monorepo layout & rationale — `../docs/architecture/monorepo-restructure.md`
- Guides — `../docs/guides/` (architecture, collection-pipeline, download, badge, bubble)
- Full dev/build/debug workflow — the `extension-dev` skill (`.claude/skills/extension-dev/`)
