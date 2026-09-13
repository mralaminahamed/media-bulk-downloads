---
title: "Install"
description: "Install Media Bulk Downloads from your browser's store, or load it unpacked from source for development."
---

Media Bulk Downloads is built from one codebase for Chrome, Edge, Firefox, and
Safari. Install it from your browser's own store below. Opera, Brave, Vivaldi, and
other Chromium browsers use the Chrome Web Store build.

## From your browser's store

| Browser | Where | Notes |
|---|---|---|
| **Chrome** | [Chrome Web Store](https://chromewebstore.google.com/detail/media-bulk-downloads/jmdhkdengijmmkelofaleinbipophckn) | Also for Brave, Vivaldi, and other Chromium browsers. |
| **Edge** | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/media-bulk-downloads/ihhhecmabfocelgmjafijchhhlpdlnll) | Same build family as Chrome. |
| **Firefox** | [Firefox Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/media-bulk-downloads/) | Firefox 140 or newer. |
| **Opera** | Chrome Web Store build | Opera store listing is under review. |
| **Safari** | App Store | Under review; ships as a native macOS app wrapping the extension. |

To install: open the store link, click **Add** (or **Get** / **Install**), and
confirm. The extension asks for the access it needs, explained in
[Permissions & privacy](/media-bulk-downloads/reference/permissions/).

## After installing

Pin the toolbar icon so it is always one click away, then open any page with
media on it and click the icon. What happens depends on the page:

- On a normal page the on-page **bubble** opens by default. See
  [On-page bubble](/media-bulk-downloads/guides/bubble/).
- On a restricted page (a browser store, `chrome://` pages) the **popup** opens
  instead.

From there, scan, filter, and download. See the
[Quick Start](/media-bulk-downloads/getting-started/quick-start/#first-use) for a
walk-through of your first download.

## Updating

Store installs update themselves through the browser. Each release also lists its
changes in the
[changelog](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/CHANGELOG.md).
Adding a new required permission can pause auto-update until you approve it once.

## For developers: load unpacked

To run a build from source with hot reload, or to try an unreleased change, build
it and load the unpacked output. The full developer flow (prerequisites, `yarn
dev`, `yarn build`, and loading the `.output` directory) is in the
[Quick Start](/media-bulk-downloads/getting-started/quick-start/).

## Related

- [Quick Start](/media-bulk-downloads/getting-started/quick-start/) for first use and the developer build.
- [Permissions & privacy](/media-bulk-downloads/reference/permissions/) for what the extension can access.
- [vs. other tools](/media-bulk-downloads/getting-started/comparison/) if you are deciding whether to install.

---
