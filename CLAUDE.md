# Media Bulk Downloads — repo guide for Claude Code

Cross-browser (Chrome · Firefox · Edge · Safari) Manifest-V3 extension that
bulk-downloads images/video/audio from any page, built with **WXT** in a
**yarn-workspaces monorepo**. Node **20.19+** (`.nvmrc` pins 22), **Corepack Yarn
`4.17.1` — never npm**.

## Commands (run from the repo root)

```bash
yarn dev            # Chrome dev (HMR) → apps/extension/.output/chrome-mv3
yarn build          # also :firefox :edge :safari :all
yarn zip            # store zips → apps/extension/.output/  (also :firefox :edge :all)
yarn type-check     # wxt prepare + tsc -b + tsc --noEmit   (run before trusting tsc)
yarn lint           # eslint (whole workspace)
yarn test           # vitest + coverage (packages) then the app suite (~3000 tests)
yarn test:e2e       # Playwright, real Chromium, drives the on-page bubble
```

The pre-PR gate is `yarn type-check && yarn lint && yarn test && yarn build`.
**Check the real exit code** — piping a gate through `tail`/`grep` masks it
(`echo $?` / `${PIPESTATUS[0]}`). Or use `/gate`.

## Layout & the one rule

Four workspaces; import direction is **one-way: app → storage/platform → core**.

- `packages/core` (`@mbd/core`) — pure domain logic (collection, resolvers,
  sniffers, download byte-logic, net). **No `chrome.*`, imports no other package.**
- `packages/storage` (`@mbd/storage`) — `chrome.storage` + IndexedDB stores.
- `packages/platform` (`@mbd/platform`) — browser-capability contracts + detection.
- `apps/extension` (`@mbd/extension`) — the WXT app; the only layer that touches
  `chrome.*` freely.

Each package/app has a README; deep design in `docs/website/src/content/docs/` +
`docs/architecture/monorepo-restructure.md`.

## Conventions

- **Yarn only, never npm.** Never stage `package.json` / `yarn.lock` / `.yarnrc.yml`
  unless the change is intentionally about deps.
- **Minimal comments — keep code self-documenting.** Don't add verbose multi-line
  `//` WHY blocks; keep only JSDoc + functional directives (`eslint-disable`,
  `@ts-*`, `@vitest-environment`, `///`). For a bulk strip use a TypeScript-parser
  pass, never regex.
- **Ship flow:** branch off `main` (`feat/…` `fix/…` `docs/…` `chore/…`) → commit →
  push → PR → **`gh pr merge <n> --merge --delete-branch`**. **Merge commits only —
  never squash or rebase.** Sync `main` after. (`/ship` automates this.)
- **No `Claude-Session` trailers or links** in commits, PRs, or issues.
- On a shipped **product** change, add a `CHANGELOG.md` `[Unreleased]` entry
  (docs/tooling changes don't get one). `CHANGELOG.md` stays at the repo root —
  `release.yml` reads `## [X.Y.Z]` from it.
- **Keep the docs website current.** User + developer docs are an Astro Starlight
  site in **`docs/website/`** (published to GitHub Pages, see `## Documentation`).
  When you add / improve a feature, resolver, or benchmark result, update the
  matching page under `docs/website/src/content/docs/` in the SAME PR — a new
  feature → its guide (`guides/` or `how-it-works/`); new/changed site coverage →
  `benchmark/coverage-matrix.md` + `benchmark/changelog.md` (the coverage log) and
  `benchmark/gaps.md`; a comparison-relevant change → `getting-started/comparison.md`.
- Confirm before outward/irreversible actions (pushes, merges, store uploads).

## Documentation (`docs/website/`)

The canonical guides + benchmark are an **Astro Starlight** site in `docs/website/`,
deployed to GitHub Pages by `.github/workflows/docs.yml` on push to `main` touching
`docs/website/**`. Live at `https://mralaminahamed.github.io/media-bulk-downloads/`.

- **Content:** `docs/website/src/content/docs/` — sections `getting-started/`
  (incl. `comparison.md`), `guides/` (user features), `how-it-works/` (internals:
  collection pipeline, resolvers, architecture), `benchmark/` (methodology, results,
  coverage, gaps, and `changelog.md` = the resolver-coverage log). Sidebar +
  branding in `astro.config.mjs`.
- **Isolated yarn project** (not a workspace member): it has its own `yarn.lock`
  (kept committed) + `.yarnrc.yml`. Work in it from `docs/website/`:
  `corepack yarn install` then `corepack yarn dev` / `corepack yarn build`.
- Files are Markdown/MDX with Starlight frontmatter (`title:`). `.mdx` parses `<...>`
  as JSX — never put raw `<tag>` in an `.mdx` (use plain words or a `.md` file).
- Cross-links between docs use relative `.md` paths (base-safe); out-of-site targets
  (root `CHANGELOG.md`, `docs/marketing/`, `docs/architecture/`) link to GitHub URLs.

## Skills (reach for these first)

`.claude/skills/`: **adding-a-resolver** (new site support — recon-probe first,
close if generic already wins), **extension-dev** (where code goes, MV3 pitfalls),
**storage-and-settings** (persistence, the settings-write path), **releasing**
(version bump → stores → tag), **testing-and-verifying** (Vitest + browser
verify), **ui-design-system** (the `mbd:`-prefixed Tailwind + token/component
classes). Each skill has self-contained `references/` files carrying the required
data (external URLs are optional further reading only).

**Global process skills (invoke when they fit — before the work, not after):**
`superpowers:brainstorming` before building a feature; `superpowers:writing-plans`
for a multi-step change; `superpowers:test-driven-development` when implementing
(failing test first — the resolver commands lean on it);
`superpowers:systematic-debugging` for any bug / test failure / unexpected
behavior; `superpowers:verification-before-completion` before claiming done or
shipping (evidence before assertions); `superpowers:requesting-code-review` before
a merge; `superpowers:using-git-worktrees` for isolated feature work. A repo skill
sets the domain approach; the process skill sets the method — use both.

## Commands (`.claude/commands/`)

- **`/ship`** — branch → commit → PR → merge (merge commit, delete branch) → sync.
- **`/gate`** — the pre-PR gate with real exit codes.
- **Site support** — `/resolver:find` (search new sites worth supporting →
  candidates), `/resolver:recon <site>` (probe one candidate → build-or-close),
  `/resolver:add <site>` (build a new one end to end, TDD), `/resolver:improve
  <name>` (audit + fix an existing site/sniffer against the live site).

## Agents (`.claude/agents/`, dispatched via the Agent tool)

- **`resolver-recon`** — read-only build-or-close probe of one site; fan out in
  parallel from `/resolver:find`.
- **`resolver-reviewer`** — reviews a resolver diff against the contract + security
  rules; run before shipping a resolver.
- **`doc-auditor`** — read-only staleness audit of a doc/skill cluster vs code; fan
  out over clusters. (Generic build/investigate/review → the `cavecrew-*` agents.)
