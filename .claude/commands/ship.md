---
description: Branch off main, commit, push, open a PR, merge it (merge commit, delete branch), then sync main.
argument-hint: "<type>: <short title>   e.g.  docs: fix broken anchor"
allowed-tools: Bash(git:*), Bash(gh:*)
---

Ship the current change following this repo's flow. Title/intent: **$ARGUMENTS**

1. **Branch** — `<type>/<kebab-slug>` (`<type>` = the Conventional-Commits prefix
   from the title: `feat` `fix` `docs` `chore` `refactor` `test` `perf`).
   `git fetch origin main -q && git checkout -b <branch> origin/main`.
2. **Stage** — keep an existing staged set; else stage the relevant tracked
   changes. **Never** stage `package.json` / `yarn.lock` / `.yarnrc.yml` unless the
   change is intentionally about dependencies. Print `git status --short` and sanity
   check the set (no stray files, no forbidden files).
3. **Commit** — a Conventional-Commits message: subject from the title + a short
   body with the *why* when non-obvious. **No `Claude-Session` trailer or link.**
4. **Push** — `git push -u origin <branch>`.
5. **PR** — `gh pr create` with a clear title and a body: what changed, why, how it
   was verified (paste the `/gate` result for code changes).
6. **Merge** — **`gh pr merge <branch> --merge --delete-branch`**. Merge commit
   only — never squash or rebase.
7. **Sync** — `git checkout main -q && git pull -q --ff-only origin main`; report the
   PR number + new `main` short SHA; confirm the tree is clean.

Gates: for a **code** change run `/gate` first and confirm it with
`superpowers:verification-before-completion` (evidence before "done") — don't ship
red. For a **product** change add a `CHANGELOG.md` `[Unreleased]` entry before step
2. Merging is outward-facing — the invocation is the go-ahead, but pause if the diff
includes anything unexpected. Big/risky diffs: consider
`superpowers:requesting-code-review` before the merge.
