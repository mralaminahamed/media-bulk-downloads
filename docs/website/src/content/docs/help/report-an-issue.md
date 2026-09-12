---
title: "Report an issue"
description: "How to report a bug, request a feature, flag a site that stopped working, or disclose a security problem, with direct links and what to include."
---

Found a bug, want a feature, or hit a site that stopped resolving? Here's the
fastest way to get it in front of us. Everything goes through GitHub Issues, no
account setup beyond a free GitHub login.

## Report a bug

**[Open a bug report](https://github.com/mralaminahamed/media-bulk-downloads/issues/new?template=bug_report.yml)**

The form walks you through it. A good report includes:

- **What happened vs. what you expected** (for example: "expected 20 photos, only
  14 downloaded").
- **Steps to reproduce**, starting from the page URL.
- **The page URL**, if it's public and shareable.
- **Your extension version** (Settings, or the store listing) and **browser + OS**.
- **Any console errors**. Open `chrome://extensions`, find the extension, and click
  "Inspect views: service worker" for background errors; the page console catches
  the rest.
- A **screenshot or short screen recording** if it helps.

Please search [existing issues](https://github.com/mralaminahamed/media-bulk-downloads/issues)
first so we can keep one thread per problem.

## Request a feature

**[Open a feature request](https://github.com/mralaminahamed/media-bulk-downloads/issues/new?template=feature_request.yml)**

Describe the problem you're trying to solve, not just the solution. If it's about a
specific site, include an example page.

## A site stopped working

Sites change their markup and CDNs without notice, so a resolver that worked before
can drift. If a site stops giving you originals, file a bug with the **page URL**
and what you expected. The live
[coverage matrix](/media-bulk-downloads/benchmark/coverage-matrix/) shows what's
currently supported and how.

## Security vulnerability

Do not open a public issue for a security problem. Follow the private disclosure
process in
[SECURITY.md](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/SECURITY.md).

## Contribute a fix

Pull requests are welcome. See the
[Contributing guide](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/CONTRIBUTING.md)
for the setup and the pre-PR checks.
