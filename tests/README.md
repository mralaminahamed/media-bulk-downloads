# `tests/` — shared test scaffolding

Cross-cutting test setup and ambient declarations shared by the workspace suites.
**The actual tests do not live here** — they are co-located with the code they
cover, under each workspace's own `tests/`:

- `packages/core/tests/`, `packages/storage/tests/`, `packages/platform/tests/`
- `apps/extension/tests/unit/` (+ `tests/setup/setupTests.ts` there)

## What's in this folder

| File                     | Purpose                                                                                                                                                         |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `setup/chrome-mock.ts`   | The shared global `chrome.*` mock (storage, tabs, runtime, downloads, action) reused by the extension and package suites.                                       |
| `setup/dom-polyfills.ts` | jsdom gap-fillers the suites rely on.                                                                                                                           |
| `test-modules.d.ts`      | Ambient module declarations for the test build — e.g. Vite `*?raw` imports used to load HTML / m3u8 fixtures as strings. Referenced by `../tsconfig.test.json`. |

## Running

```bash
yarn test        # root: vitest run --coverage (core/storage/platform) + the extension suite
```

`../vitest.config.ts` runs the three packages as separate projects;
`apps/extension` runs via its own config (`yarn workspace @mbd/extension test`).
`../tsconfig.test.json` type-checks `packages/*/tests/**` plus `test-modules.d.ts`.

## More

- Test patterns, the chrome mock, and the browser-preview harness — the
  `testing-and-verifying` skill (`.claude/skills/testing-and-verifying/`)
- WXT unit testing — https://wxt.dev/guide/essentials/unit-testing
