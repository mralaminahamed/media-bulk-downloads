---
description: Run the full pre-PR gate (type-check · lint · test · build) and report each step's REAL exit code.
argument-hint: "(optional) quick   — skip test+build, run only type-check + lint"
---

Run this repo's pre-PR gate from the root and report pass/fail **per step using the
real exit code** — never trust a truncated tail. For each: capture output to a temp
file, print `EXIT=$?` (or `${PIPESTATUS[0]}`), and surface the shortest decisive line
on failure.

Full gate (default):

```bash
yarn type-check   # tsc -b packages + tsc --noEmit + app wxt-prepare/tsc
yarn lint         # eslint (0 errors; the 3 exhaustive-deps warnings are pre-existing)
yarn test         # vitest + coverage (packages) then the app suite
yarn build        # wxt build → apps/extension/.output/chrome-mv3
```

If `$ARGUMENTS` contains `quick`, run only `type-check` + `lint`.

Report a compact summary: `type-check ✓ · lint ✓ (N warnings) · test ✓ (X tests) ·
build ✓`, or the first failing step with its error. Do not proceed to `/ship` if any
step fails.
