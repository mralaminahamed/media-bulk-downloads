---
description: Run the pre-PR gate (type-check · lint · test · build) and report each step's REAL exit code.
argument-hint: "(optional) quick — run only type-check + lint"
allowed-tools: Bash(yarn:*)
---

Run the pre-PR gate from the repo root and report pass/fail **per step by its real
exit code** — never trust a truncated tail. For each step: capture output to a temp
file, read `EXIT=$?` (or `${PIPESTATUS[0]}` when piping), and on failure surface the
shortest decisive line.

```bash
yarn type-check   # tsc -b packages + tsc --noEmit + app wxt-prepare/tsc
yarn lint         # eslint — 0 errors (3 pre-existing exhaustive-deps warnings are OK)
yarn test         # vitest + coverage (packages) then the app suite (~3000 tests)
yarn build        # wxt build → apps/extension/.output/chrome-mv3
```

If `$ARGUMENTS` contains `quick`, run only `type-check` + `lint` (fast inner loop).

Report a compact line — `type-check ✓ · lint ✓ (N warn) · test ✓ (X tests) · build
✓` — or the first failing step with its error. Do **not** proceed to `/ship` if any
step fails. (e2e is separate: `yarn test:e2e`, real Chromium — not part of this gate.)
