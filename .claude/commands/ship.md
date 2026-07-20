---
description: Branch off main, commit, push, open a PR, and merge it (merge commit, delete branch), then sync main.
argument-hint: "<type>: <short title>   e.g.  docs: fix broken anchor"
---

Ship the current change following this repo's flow. Title/description for the work: **$ARGUMENTS**

Steps:

1. Derive a branch name: `<type>/<kebab-slug-of-title>` where `<type>` is the
   conventional prefix from the title (`feat` `fix` `docs` `chore` `refactor` `test`).
2. `git fetch origin main -q` then `git checkout -b <branch> origin/main`.
3. Stage the change. If files are already staged, keep that set. Otherwise stage the
   relevant tracked modifications — **never** stage `package.json`, `yarn.lock`, or
   `.yarnrc.yml` unless this change is intentionally about dependencies. Show
   `git status --short` and confirm the set looks right.
4. Commit with a Conventional-Commits message built from the title (subject + a
   short body explaining the why when it isn't obvious). **No `Claude-Session`
   trailer or link.**
5. `git push -u origin <branch>`.
6. `gh pr create` with a clear title and a body describing what changed, why, and
   how it was verified.
7. Merge it: **`gh pr merge <branch> --merge --delete-branch`** — a merge commit,
   never squash or rebase.
8. `git checkout main -q && git pull -q --ff-only origin main`, then report the PR
   number and the new `main` short SHA, and confirm the tree is clean.

If this is a **product** change (not docs/tooling), also add a `CHANGELOG.md`
`[Unreleased]` entry before step 3. If the gate hasn't been run yet and this
touches code, run `/gate` first.
