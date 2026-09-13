---
title: "Permissions & privacy"
description: "What each browser permission the extension requests is for, which are optional, and why the extension is private by default."
---

A media downloader needs some real access to do its job, and this page explains
exactly what each permission is for. The short version: the extension asks for
what it needs to read a page and save files, nothing is used for tracking, and the
two most sensitive capabilities are optional and requested only when you turn on
the feature that needs them.

The full, published policy is in
[PRIVACY.md](https://github.com/mralaminahamed/media-bulk-downloads/blob/main/PRIVACY.md).

## Required permissions

These are requested at install because core features depend on them.

| Permission | Why it is needed |
|---|---|
| `downloads` | Save the media you pick, through the browser's own download manager. |
| `downloads.open` | Open a downloaded file from the in-app History. |
| `storage` | Keep your settings and history on your device. |
| `tabs` | Read the active tab's URL and title, to label downloads and open a source page. |
| `contextMenus` | Add the right-click actions (download all, download this image, and so on). |
| `offscreen` | Assemble captured HLS and DASH streams into one file in a background document. |
| `<all_urls>` (host access) | Read media on whatever page you run it on. Collection stays on-device; it never phones home. |

Host access is broad because the extension has to work on any page you choose to
run it on, and the toolbar badge counts media on the current tab. It is used to
read what a page already loaded, not to browse on your behalf.

## Optional permissions

These are never requested at install. The extension asks only the first time you
use the feature, and you can decline.

| Permission | Requested when | For |
|---|---|---|
| `notifications` | You turn on "Notify when downloads finish". | A desktop toast when a batch completes. |
| `declarativeNetRequestWithHostAccess` | You use **Retry w/ referer** on a blocked download. | A short-lived, single-URL rule that sends the source page as the `Referer` to recover a hotlink-protected file, then removes itself. See [The download queue](/media-bulk-downloads/guides/download-queue/). |

## Private by design

- **Network-free by default.** Collection reads only what the page already loaded.
  There are no accounts, no analytics, and no servers of ours.
- **On-device data.** Settings sync through your browser's own storage; history,
  favourites, and blocked sources stay on your device.
- **The opt-in exceptions.** Turning on
  [Resolve originals](/media-bulk-downloads/how-it-works/resolve-originals/) or
  [capturing a stream](/media-bulk-downloads/guides/stream-capture/) makes network
  requests, and then only directly to the media's own site or CDN.

## Differences by browser

The extension is built from one codebase, but each browser gets only the
permissions it can use:

- **Safari** does not use `downloads`, `downloads.open`, `offscreen`, or the
  optional permissions; it collects from the page DOM and saves through the browser.
- **Firefox** does not use `offscreen` (it captures streams in an extension page
  instead) and does not offer the referer retry.

## Related

- [Settings reference](/media-bulk-downloads/reference/settings/) for what each setting does.
- [FAQ & troubleshooting](/media-bulk-downloads/help/faq/) for privacy questions.
- [The download queue](/media-bulk-downloads/guides/download-queue/) for the referer retry that uses the optional network permission.

---
