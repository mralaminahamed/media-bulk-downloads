---
name: testing-and-verifying
description: Write Jest tests for this extension (background worker, content script, popup React UI) and verify UI/collection changes in a real browser. Use when adding tests, mocking chrome.* APIs, testing message handlers, or when asked to "verify in the browser" a popup/filter/collection change you can't see by loading the unpacked extension.
---

# Testing & verifying

Stack: Jest + ts-jest + jsdom + Testing Library. Config: `jest.config.cjs`
(`@/` → `src`). Global chrome mock: `tests/setupTests.ts`. Tests mirror `src/`
under `tests/`.

## Mocking chrome

- `tests/setupTests.ts` provides a global `chrome` mock (storage, tabs, runtime,
  downloads, action). Extend it there when you use a new API; override per-test
  with `(chrome.x.y as jest.Mock).mockImplementation(...)`.
- To exercise a **listener registered at import** (message router, onChanged,
  onClicked), grab it from the mock:
  `const handler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0]`
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

1. `yarn build` → copy the compiled `.output/chrome-mv3/assets/popup-*.css`
   (Tailwind already compiled) to a scratch dir.
2. Write `preview.tsx`: stub `globalThis.chrome`, render the real
   `<App collect={async () => sampleMedia} surface="popup" />` with sample items
   (use `data:image/svg+xml` placeholders — remote URLs prevent `document_idle`).
3. Bundle with esbuild from **inside the project** so `node_modules` resolves:
   `esbuild preview.tsx --bundle --format=iife --alias:@=$PWD/src --jsx=automatic`.
4. Serve over **http** (not `file://`) and open in the browser tab.
5. Verify by **measuring the DOM** (`getBoundingClientRect`, `getComputedStyle`)
   via the javascript tool — precise for sizing/color, and works even when the
   screenshot idle-wait fails. Clean up the server + scratch dir after.

This is how the filter-control sizing bug was found (Type dropdown measured
428×34 instead of 120×28 — see the `ui-design-system` cascade trap).

## Live collection benchmark

For `collectMedia()` against real sites, bundle the real collector into an IIFE
exposing `window.__bench`, inject with the javascript tool, run once. Strip query
strings from any sample output (the safety filter blocks raw tokens). Record in
`docs/BENCHMARK.md`.
