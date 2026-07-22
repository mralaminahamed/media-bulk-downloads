# @mbd/extension — Media Bulk Downloads (Browser Extension)

The **Media Bulk Downloads** browser extension itself — the WXT Manifest-V3 app
that ships to the Chrome Web Store, Firefox Add-ons, Microsoft Edge Add-ons, and
(under review) the Mac App Store. It composes the browser-agnostic `@mbd/*`
domain packages under `../../packages/` into the actual product: popup, on-page
bubble, background worker, content scripts, and the HLS/DASH capture pipeline.

## Layout

```
src/
├── entrypoints/          # WXT entrypoints (become the manifest)
│   ├── background.ts      #   service worker
│   ├── content.ts         #   the content-script relay + bubble mount
│   ├── *-media-sniffer.content.ts   # MAIN-world passive sniffers
│   │                                #   (fb / ig / x / pinterest / hls)
│   ├── offscreen/          #   offscreen document (stream assembly)
│   └── popup/              #   popup entry
├── extension/            # the app logic behind the entrypoints
│   ├── background/         #   message router, context menu, commands, queue
│   ├── content/            #   page collection + bubble host
│   ├── popup/              #   popup React app (components, hooks, panels)
│   ├── bubble/             #   on-page bubble (isolated Shadow DOM)
│   ├── offscreen/          #   capture host
│   ├── components/         #   shared UI (BrandMark, …)
│   ├── shared/             #   active-tab collect / deep-scan helpers
│   └── platform/           #   per-browser capability impls (the @mbd/platform seam)
├── styles/               # Tailwind v4 entry + design tokens
├── public/               # extension icons (manifest inputs)
└── types/                # ambient CSS-module declarations
```

Config: `wxt.config.ts` (manifest, browser targets, zip naming),
`web-ext.config.ts` (dev launch), `playwright.config.ts` (e2e).

## Develop, build, package

Run from the **repo root** (the root scripts proxy to this workspace):

```bash
yarn dev            # Chrome dev, HMR → .output/chrome-mv3
yarn dev:firefox    # Firefox dev profile
yarn build:all      # chrome · firefox · edge → .output/<browser>-mv3
yarn build:safari   # Safari build → .output/safari-mv3 (wrapped by ../safari-native)
yarn zip:all        # store zips → .output/*.zip
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** →
`.output/chrome-mv3`.

## Tests

- **Unit / integration** (Vitest, jsdom) under `tests/unit/` — `yarn test`.
- **End-to-end** (Playwright, real Chromium, drives the bubble) under `tests/e2e/`
  — `yarn test:e2e`. See [`tests/e2e/README.md`](./tests/e2e/README.md).

## Boundary

This is the **only** layer that touches `chrome.*` freely; everything reusable
and browser-agnostic lives in `../../packages/` (`@mbd/core`, `@mbd/storage`,
`@mbd/platform`). Import direction is one-way: **app → storage/platform → core**.

## More

- [Architecture guide](../../docs/website/src/content/docs/how-it-works/architecture.md) — surfaces, module &
  message catalog, data model (the source of truth)
- [`../safari-native/README.md`](../safari-native/README.md) — the Safari native
  wrapper and its platform caveats
- The `extension-dev` skill (`.claude/skills/extension-dev/`) — full dev/build/debug workflow
