---
title: "The download queue"
description: "Track every download in a persistent queue that survives the popup closing, with pause, cancel, retry, and hotlink-403 recovery."
---

Every file you save goes through a queue, shown at the bottom of the popup. The
queue is the extension's source of truth for downloads: it survives the popup
closing and even the background worker restarting, so a large batch keeps going
and you can reopen the popup later to see how it finished.

For how files are named and where they land, see
[Download & queue](/media-bulk-downloads/guides/download/). This page is about the
queue panel itself.

## Reading the queue

The header shows a running **done / total** count, a red **failed** count when
anything has failed, and a progress bar that reflects the mean completion across
all items. When everything is done the bar reads exactly 100%. Collapse the panel
with the chevron if you want it out of the way; it remembers the collapsed state.

Each row shows an item's status, file name, and a control that fits its state:

| Status | Row shows |
|---|---|
| Queued | A clock icon and a Cancel button. |
| Downloading | A live progress bar, percent, bytes received of total, and Cancel. |
| Done | A check and an **Open file** button. |
| Failed | A short reason and a **Retry** button. |

## Controls

The header buttons act on the whole queue:

- **Pause / Resume** stops starting new downloads and picks back up where it left
  off. In-flight items finish.
- **Retry failed** re-queues every failed item at once.
- **Clear done** removes finished and failed rows, leaving anything still running.
- **Cancel all** stops everything.

## When a download fails

A failed row explains why in plain language rather than a raw error code:

| Reason shown | What happened |
|---|---|
| Blocked by the server | The server refused the request (often hotlink protection). Try Retry w/ referer. |
| Link expired | A signed URL's signature timed out. |
| Failed after several tries | It was retried automatically and still did not succeed. |
| Cancelled | You cancelled it. |

### Retry with referer (hotlink 403)

Some sites only serve a file when the request looks like it came from their own
page, and return HTTP 403 otherwise. When a failure looks like this, the row
offers **Retry w/ referer** instead of a plain retry. It arms a single, short-lived
rule that sends the source page as the `Referer` for one retry, then tears it down.

The first time you use it, the browser asks for an optional permission
(`declarativeNetRequestWithHostAccess`); the extension never requests it at
install. This recovery is not available on Firefox, which does not support the
header-rewrite rule it relies on; there the row falls back to a plain retry.

### Expired links cannot be retried

A signed URL that has expired is dead for good, so an expired row shows **Link
expired** with no retry: the same URL can never succeed again. Reopen the source
page and collect it again to get a freshly signed link, then download that.

## Related

- [Download & queue](/media-bulk-downloads/guides/download/) for naming, paths, and ZIP.
- [FAQ & troubleshooting](/media-bulk-downloads/help/faq/) for downloads that never appear.
- [Version badge](/media-bulk-downloads/how-it-works/badge/) for how a failed download shows on the toolbar icon.

---
