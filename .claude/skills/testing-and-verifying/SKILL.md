---
name: testing-and-verifying
description: Write Vitest tests for this extension (background worker, content script, popup React UI) and verify UI/collection changes in a real browser. Use when adding tests, mocking chrome.* APIs, testing message handlers, or when asked to "verify in the browser" a popup/filter/collection change you can't see by loading the unpacked extension.
---

# Testing & verifying

Stack: Vitest (WxtVitest plugin) + jsdom + Testing Library. This is a monorepo:
the root `vitest.config.ts` only orchestrates per-package projects
(`packages/core|storage|platform` + `apps/extension`), each owning its own env,
setup, and alias. The EXTENSION app's config is `apps/extension/vitest.config.ts`
(`@/` → `apps/extension/src`, via the WXT plugin; `globals: true`, so
`vi`/`describe`/`it`/`expect` need no import). Global chrome mock:
`apps/extension/tests/unit/setupTests.ts` (wired via `setupFiles`). Tests mirror
`apps/extension/src/` under `apps/extension/tests/` (and each package mirrors its
own `src/` under `tests/`). Run: `yarn test` (root, all projects + coverage).

## Mocking chrome

- `apps/extension/tests/unit/setupTests.ts` provides a global `chrome` mock (storage,
  tabs, runtime, downloads, action). Extend it there when you use a new API; override per-test
  with `(chrome.x.y as Mock).mockImplementation(...)` — cast with the Vitest
  type, `import type { Mock } from 'vitest'` (there is no `jest.Mock` global).
- To exercise a **listener registered at import** (message router, onChanged,
  onClicked), grab it from the mock:
  `const handler = (chrome.runtime.onMessage.addListener as Mock).mock.calls[0][0]`
  then call `handler(message, sender, sendResponse)`.
- The **background worker is async now** (settings gate). Message-handler tests
  must `await` a microtask flush (`await new Promise(r => setTimeout(r, 0))`)
  before asserting `chrome.downloads.download` was called.
- Callback-form APIs (`chrome.storage.sync.get(keys, cb)`) →
  `mockImplementation((_k, cb) => cb({ settings: {...} }))`.

## What good tests look like here

- Resolvers: call `resolver.resolve(new URL(...), ctx)` directly; assert the
  candidate (`url`, `kind`, `resolveHint`, `unresolvedVideo`).
- Collection: drive `collectMedia()` against `document.body.innerHTML`.
- UI: Testing Library by role/label (`getByRole`, `getByLabelText`); the modals
  expose `role="dialog"`; assert behavior, not classes.
- Bug fixes start with a failing test (TDD).

## Verifying UI in a real browser (can't load the unpacked extension)

Opening `popup.html` directly fails (App calls `chrome.*` on mount), and
`document_idle` screenshots hang on some pages. Reliable method — a preview
harness measured via the DOM:

1. `yarn build` → copy the compiled `apps/extension/.output/chrome-mv3/assets/popup-*.css`
   (Tailwind already compiled) to a scratch dir.
2. Write `preview.tsx`: stub `globalThis.chrome`, render the real
   `<App collect={async () => sampleMedia} surface="popup" />` with sample items
   (use `data:image/svg+xml` placeholders — remote URLs prevent `document_idle`).
3. Bundle with esbuild from **inside the project** so `node_modules` resolves:
   `esbuild preview.tsx --bundle --format=iife --alias:@=$PWD/apps/extension/src --jsx=automatic`.
4. Serve over **http** (not `file://`) and open in the browser tab.
5. Verify by **measuring the DOM** (`getBoundingClientRect`, `getComputedStyle`)
   via the javascript tool — precise for sizing/color, and works even when the
   screenshot idle-wait fails. Clean up the server + scratch dir after.

This is how the filter-control sizing bug was found (the Type dropdown measured
428×34 instead of 120×28 — a component class defined after Tailwind was
overriding its `h-`/`w-` utilities, fixable only with an inline `style`).

## Live collection benchmark

For `collectMedia()` against real sites, bundle the real collector into an IIFE
exposing `window.__bench`, inject with the javascript tool, run once. Strip query
strings from any sample output (the safety filter blocks raw tokens). Record in
`docs/BENCHMARK.md`.

## References

- Test config (this repo) — root `vitest.config.ts` (projects), `apps/extension/vitest.config.ts`, `apps/extension/tests/unit/setupTests.ts` (the chrome mock)
- WXT unit testing — https://wxt.dev/guide/essentials/unit-testing
- WXT e2e testing — https://wxt.dev/guide/essentials/e2e-testing
- Vitest — https://vitest.dev/guide/ · mocking — https://vitest.dev/guide/mocking · `vi` API — https://vitest.dev/api/vi
- Testing Library (queries by role/label) — https://testing-library.com/docs/queries/about
- esbuild (the preview bundler) — https://esbuild.github.io/api/
- Chrome extension debugging — https://developer.chrome.com/docs/extensions/get-started/tutorial/debug

Related skill: `ui-design-system` (the cascade trap behind the sizing bug) —
optional; this skill stands on its own.
