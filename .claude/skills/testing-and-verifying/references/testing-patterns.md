# Testing patterns cheatsheet (self-contained)

Copy-paste patterns for testing + verifying here, without external docs. Source of
truth: `apps/extension/tests/unit/setupTests.ts`, the `*.config.ts` files, and
`apps/extension/tests/e2e/`.

## Layout & run

Monorepo: root `vitest.config.ts` orchestrates per-package projects
(`packages/core|storage|platform`) + the app (`apps/extension/vitest.config.ts`,
`@/`→`apps/extension/src`, `globals:true` so `vi`/`describe`/`it`/`expect` need no
import). Global chrome mock: `apps/extension/tests/unit/setupTests.ts`. Tests mirror
`src/` under `tests/`.

- `yarn test` — all Vitest projects + coverage (~3000 tests). **Not** e2e.
- `yarn test:e2e` / `:e2e:headed` — Playwright (builds first).
- **Check the REAL exit code** — piping through `tail`/`grep` reports the pipeline's
  status, not tsc/eslint/vitest's. `cmd > /tmp/x 2>&1; echo $?` or `${PIPESTATUS[0]}`.

## Mocking chrome (Vitest)

```ts
import type { Mock } from 'vitest';   // there is no jest.Mock global

// setupTests.ts provides a global `chrome` mock (storage, tabs, runtime,
// downloads, action). Extend it there for a new API. Override per-test:
(chrome.storage.sync.get as Mock).mockImplementation((_k, cb) => cb({ settings: {} }));

// Exercise a listener registered at import (message router / onChanged / onClicked):
const handler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0];
handler(message, sender, sendResponse);

// The background worker is async (settings gate) — flush a microtask before asserting:
await new Promise((r) => setTimeout(r, 0));
expect(chrome.downloads.download).toHaveBeenCalled();
```

- `chrome.permissions.request`'s callback **never fires** in headless e2e — test
  grant/deny at the **unit** layer (mock the callback), not in e2e.
- Reset module state between cases that import-time-register listeners with
  `vi.resetModules()` + dynamic `import()`.

## What good tests look like

- **Resolvers:** call `resolver.resolve(new URL(src), { el, allowNetwork:false, pageUrl })`
  directly; assert `url`/`kind`/`resolveHint`/`unresolvedVideo`/`mediaKey`. Assert a
  non-matching URL returns `[]`.
- **Collection:** drive `collectMedia()` against `document.body.innerHTML`.
- **UI (Testing Library):** query by role/label — `getByRole('button',{name:/…/i})`,
  `getByLabelText`, `findByText`; modals expose `role="dialog"`. Assert **behavior,
  not classes**. `userEvent` for clicks/keyboard.
- Bug fixes start with a **failing test** (TDD).

## e2e (Playwright, real Chromium)

Specs/fixtures/pages/server under `apps/extension/tests/e2e/`; config
`apps/extension/playwright.config.ts` (persistent context, **one worker** — an
extension needs a persistent profile; `testDir:tests/e2e`; a `webServer` serves
`pages/`). The fixture (`fixtures/extension.ts`) loads the built extension and
exposes `context` + `extensionId`; `helpers/bubble.ts` has `openBubblePage()`
(seeds `bubbleEnabled` via the SW, then opens the launcher). Playwright's role/CSS
locators pierce the bubble's open shadow root automatically.

## Verifying UI in a real browser (can't load the unpacked extension)

Opening `popup.html` directly fails (App calls `chrome.*` on mount);
`document_idle` screenshots hang on some pages. Reliable = a preview harness
measured via the DOM:

1. `yarn build`, copy `.output/chrome-mv3/assets/popup-*.css` (Tailwind compiled)
   to a scratch dir.
2. `preview.tsx`: stub `globalThis.chrome`, render the real `<App collect={async
   () => sampleMedia} surface="popup" />` with **`data:image/svg+xml`** placeholders
   (remote URLs prevent `document_idle`).
3. Bundle **from inside the project** (so `node_modules` resolves): `esbuild
   preview.tsx --bundle --format=iife --alias:@=$PWD/apps/extension/src --jsx=automatic`.
4. Serve over **http** (not `file://`), open in the tab.
5. **Verify by measuring the DOM** (`getBoundingClientRect`, `getComputedStyle`) via
   the javascript tool — precise for sizing/color; works when the idle-wait fails.
   Clean up server + scratch dir.

⚠️ The offscreen automation tab **won't composite CSS animation/rAF** and **won't
decode images** (`img.complete=false`, `naturalWidth=0`, screenshots time out).
Verify animated/image content by **DOM state** (classes, computed style, geometry,
URLs), never by frames/pixels.

## Live collection benchmark

Bundle the real `collectMedia()` into an IIFE exposing `window.__bench`, inject with
the javascript tool, run once. **Strip query strings** from sample output (the
safety filter blocks raw tokens). Record in `https://mralaminahamed.github.io/media-bulk-downloads/benchmark/overview/`.
